import {
  parseRealtimeClientMessage,
  serializeRealtimeServerMessage,
  type RealtimeClientMessage,
  type RealtimeErrorMessage,
  type RunEventSpec,
  type RealtimeServerMessage,
  type RunEventMessage,
} from "@agent-center/shared";
import type { WSContext } from "hono/ws";

import { listRunEventsAfter } from "./run-events-repository";

const POLL_INTERVAL_MS = Number(process.env.RUN_EVENTS_POLL_INTERVAL_MS ?? 1_000);
const POLL_BATCH_SIZE = 100;

type ConnectionSocket = WSContext;
type ConnectionKey = object;
type ListRunEventsAfter = (
  runId: string,
  afterSequence: number,
  limit: number,
) => Promise<RunEventSpec[]>;
type AuthorizeRunSubscription = (runId: string, userId?: string) => Promise<void>;
type AuthorizeTaskSubscription = (userId?: string) => Promise<void>;

interface RunCursor {
  lastSequence: number;
}

interface ConnectionSession {
  socket: ConnectionSocket;
  subscriptions: Map<string, RunCursor>;
  userId?: string;
}

export class RunEventsHub {
  private readonly sessions = new Map<ConnectionKey, ConnectionSession>();
  private readonly taskSubscribers = new Set<ConnectionKey>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;

  constructor(
    private readonly pollRunEvents: ListRunEventsAfter = listRunEventsAfter,
    private readonly authorizeRunSubscription: AuthorizeRunSubscription = async (runId, userId) => {
      const { runService } = await import("../services/run-service");
      await runService.assertRunAccess(runId, userId);
    },
    private readonly authorizeTaskSubscription: AuthorizeTaskSubscription = async (userId) => {
      if (!userId) {
        return;
      }

      const [{ db, workspaces }, { eq }] = await Promise.all([
        import("@agent-center/db"),
        import("drizzle-orm"),
      ]);
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.ownerId, userId),
      });

      if (workspace === undefined) {
        throw new Error("No accessible workspace");
      }
    },
  ) {}

  register(socket: ConnectionSocket, userId?: string) {
    const existingSession = this.sessions.get(this.getConnectionKey(socket));

    if (existingSession) {
      existingSession.socket = socket;
      existingSession.userId = userId;
      return;
    }

    this.sessions.set(this.getConnectionKey(socket), {
      socket,
      subscriptions: new Map(),
      userId,
    });
  }

  unregister(socket: ConnectionSocket) {
    const key = this.getConnectionKey(socket);
    this.sessions.delete(key);
    this.taskSubscribers.delete(key);

    if (this.sessions.size === 0) {
      this.stopPolling();
      return;
    }

    if (!this.hasActiveSubscriptions()) {
      this.stopPolling();
    }
  }

  async handleMessage(socket: ConnectionSocket, rawMessage: string) {
    const session = this.getOrCreateSession(socket);

    const parsed = parseRealtimeClientMessage(rawMessage);

    if (!parsed.success) {
      this.sendError(socket, parsed.error);
      return;
    }

    await this.handleClientMessage(session, parsed.data);
  }

  private async handleClientMessage(session: ConnectionSession, message: RealtimeClientMessage) {
    if (message.type === "ping") {
      this.send(session.socket, {
        type: "pong",
      });
      return;
    }

    if (message.type === "subscribe_tasks") {
      try {
        await this.authorizeTaskSubscription(session.userId);
      } catch {
        this.sendError(session.socket, "You do not have access to task realtime updates.");
        return;
      }

      this.taskSubscribers.add(this.getConnectionKey(session.socket));
      return;
    }

    if (message.type === "unsubscribe_tasks") {
      this.taskSubscribers.delete(this.getConnectionKey(session.socket));
      return;
    }

    if (message.type === "subscribe_run") {
      try {
        await this.authorizeRunSubscription(message.runId, session.userId);
      } catch {
        this.sendError(session.socket, "You do not have access to this run.");
        return;
      }

      if (!session.subscriptions.has(message.runId)) {
        session.subscriptions.set(message.runId, {
          lastSequence: 0,
        });
      }

      this.ensurePolling();
      this.send(session.socket, {
        type: "subscribed",
        runId: message.runId,
      });

      await this.pollOnce();
      return;
    }

    session.subscriptions.delete(message.runId);

    if (!this.hasActiveSubscriptions()) {
      this.stopPolling();
    }
  }

  notifyTasksChanged() {
    for (const key of this.taskSubscribers) {
      const session = this.sessions.get(key);

      if (!session) {
        this.taskSubscribers.delete(key);
        continue;
      }

      this.send(session.socket, { type: "tasks_changed" });
    }
  }

  private ensurePolling() {
    if (this.pollInterval !== null) {
      return;
    }

    this.pollInterval = setInterval(() => {
      void this.pollOnce();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private hasActiveSubscriptions(): boolean {
    for (const session of this.sessions.values()) {
      if (session.subscriptions.size > 0) {
        return true;
      }
    }

    return false;
  }

  private async pollOnce() {
    if (this.pollInFlight) {
      return;
    }

    const minSequencesByRun = this.getMinSequencesByRun();

    if (minSequencesByRun.size === 0) {
      return;
    }

    this.pollInFlight = true;

    try {
      for (const [runId, minSequence] of minSequencesByRun) {
        const events = await this.pollRunEvents(runId, minSequence, POLL_BATCH_SIZE);

        for (const event of events) {
          this.broadcastRunEvent({
            type: "run_event",
            runId,
            event,
          });
        }
      }
    } catch (error) {
      console.error("[api] websocket run event polling failed", error);

      for (const session of this.sessions.values()) {
        this.send(session.socket, {
          type: "error",
          message: "Failed to poll run events.",
        });
      }
    } finally {
      this.pollInFlight = false;
    }
  }

  private getMinSequencesByRun(): Map<string, number> {
    const minSequencesByRun = new Map<string, number>();

    for (const session of this.sessions.values()) {
      for (const [runId, cursor] of session.subscriptions) {
        const currentMin = minSequencesByRun.get(runId);

        if (currentMin === undefined || cursor.lastSequence < currentMin) {
          minSequencesByRun.set(runId, cursor.lastSequence);
        }
      }
    }

    return minSequencesByRun;
  }

  private broadcastRunEvent(message: RunEventMessage) {
    for (const session of this.sessions.values()) {
      const cursor = session.subscriptions.get(message.runId);

      if (!cursor || message.event.sequence <= cursor.lastSequence) {
        continue;
      }

      if (this.send(session.socket, message)) {
        cursor.lastSequence = message.event.sequence;
      }
    }
  }

  private sendError(socket: ConnectionSocket, message: string) {
    const payload: RealtimeErrorMessage = {
      type: "error",
      message,
    };

    this.send(socket, payload);
  }

  private send(socket: ConnectionSocket, message: RealtimeServerMessage): boolean {
    try {
      socket.send(serializeRealtimeServerMessage(message));
      return true;
    } catch (error) {
      console.error("[api] websocket send failed", error);
      this.unregister(socket);
      return false;
    }
  }

  private getOrCreateSession(socket: ConnectionSocket): ConnectionSession {
    const key = this.getConnectionKey(socket);
    const existingSession = this.sessions.get(key);

    if (existingSession) {
      existingSession.socket = socket;
      return existingSession;
    }

    const session: ConnectionSession = {
      socket,
      subscriptions: new Map(),
    };

    this.sessions.set(key, session);

    return session;
  }

  private getConnectionKey(socket: ConnectionSocket): ConnectionKey {
    if (isObject(socket.raw)) {
      return socket.raw;
    }

    return socket;
  }
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
