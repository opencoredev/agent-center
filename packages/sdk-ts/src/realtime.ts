import { AgentCenterProtocolError, AgentCenterRealtimeError } from "./errors.js";
import {
  parseRealtimeServerMessage,
  serializeRealtimeClientMessage,
  type RealtimeClientMessage,
  type RealtimeServerMessage,
} from "./protocol.js";
import type {
  RealtimeClientOptions,
  RealtimeSocketFactory,
  RealtimeSocketLike,
  RunEvent,
} from "./types.js";

const NORMAL_CLOSURE_CODE = 1_000;

class AsyncQueue<TValue> implements AsyncIterable<TValue> {
  private closed = false;
  private error: unknown;
  private readonly values: TValue[] = [];
  private readonly waiters: Array<{
    reject: (reason?: unknown) => void;
    resolve: (result: IteratorResult<TValue>) => void;
  }> = [];

  push(value: TValue) {
    if (this.closed || this.error !== undefined) {
      return;
    }

    const waiter = this.waiters.shift();

    if (waiter !== undefined) {
      waiter.resolve({
        done: false,
        value,
      });
      return;
    }

    this.values.push(value);
  }

  close() {
    if (this.closed || this.error !== undefined) {
      return;
    }

    this.closed = true;

    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({
        done: true,
        value: undefined,
      });
    }
  }

  fail(error: unknown) {
    if (this.closed || this.error !== undefined) {
      return;
    }

    this.error = error;

    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<TValue> {
    return {
      next: async () => {
        if (this.values.length > 0) {
          const value = this.values.shift() as TValue;

          return {
            done: false,
            value,
          };
        }

        if (this.error !== undefined) {
          throw this.error;
        }

        if (this.closed) {
          return {
            done: true,
            value: undefined,
          };
        }

        return await new Promise<IteratorResult<TValue>>((resolve, reject) => {
          this.waiters.push({
            reject,
            resolve,
          });
        });
      },
    };
  }
}

export class RunEventsRealtimeClient implements AsyncIterable<RealtimeServerMessage> {
  private readonly messageQueue = new AsyncQueue<RealtimeServerMessage>();
  private readonly url: string;
  private readonly webSocketFactory: RealtimeSocketFactory;
  private socket: RealtimeSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private hasOpened = false;
  private closedByUser = false;
  private readonly removeListeners: Array<() => void> = [];

  constructor(options: RealtimeClientOptions) {
    this.url = options.url;
    this.webSocketFactory = options.webSocketFactory ?? getDefaultWebSocketFactory();
  }

  async connect(): Promise<void> {
    if (this.connectPromise !== null) {
      return await this.connectPromise;
    }

    if (this.closedByUser) {
      throw new AgentCenterRealtimeError(
        "This realtime client has been closed. Create a new instance to reconnect.",
      );
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = this.webSocketFactory(this.url);
      this.socket = socket;

      this.removeListeners.push(
        addSocketListener(socket, "open", () => {
          this.hasOpened = true;
          resolve();
        }),
      );

      this.removeListeners.push(
        addSocketListener(socket, "message", (...args) => {
          void this.handleMessage(args);
        }),
      );

      this.removeListeners.push(
        addSocketListener(socket, "error", (...args) => {
          const error = new AgentCenterRealtimeError("The realtime websocket reported an error.", {
            cause: args[0],
          });

          if (!this.hasOpened) {
            reject(error);
            return;
          }

          this.messageQueue.fail(error);
        }),
      );

      this.removeListeners.push(
        addSocketListener(socket, "close", (...args) => {
          this.cleanupSocket();
          this.connectPromise = null;

          if (this.closedByUser) {
            this.messageQueue.close();
            return;
          }

          const details = normalizeCloseDetails(args);

          if (!this.hasOpened) {
            reject(
              new AgentCenterRealtimeError(
                details === undefined
                  ? "The realtime websocket closed before it finished connecting."
                  : `The realtime websocket closed before it finished connecting (${details}).`,
              ),
            );
            return;
          }

          if (details === undefined || details.code === NORMAL_CLOSURE_CODE) {
            this.messageQueue.close();
            return;
          }

          this.messageQueue.fail(
            new AgentCenterRealtimeError(
              details.reason === undefined
                ? `The realtime websocket closed unexpectedly (code ${details.code}).`
                : `The realtime websocket closed unexpectedly (code ${details.code}: ${details.reason}).`,
            ),
          );
        }),
      );
    });

    return await this.connectPromise;
  }

  async subscribe(runId: string): Promise<void> {
    await this.send({
      type: "subscribe_run",
      runId,
    });
  }

  async unsubscribe(runId: string): Promise<void> {
    await this.send({
      type: "unsubscribe_run",
      runId,
    });
  }

  async ping(): Promise<void> {
    await this.send({
      type: "ping",
    });
  }

  close(code = NORMAL_CLOSURE_CODE, reason = "Normal Closure") {
    this.closedByUser = true;

    if (this.socket !== null) {
      this.socket.close(code, reason);
      this.cleanupSocket();
    } else {
      this.messageQueue.close();
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<RealtimeServerMessage> {
    return this.messageQueue[Symbol.asyncIterator]();
  }

  private cleanupSocket() {
    this.hasOpened = false;

    for (const removeListener of this.removeListeners.splice(0)) {
      removeListener();
    }

    this.socket = null;
  }

  private async handleMessage(args: unknown[]) {
    let textPayload: string;

    try {
      textPayload = await toTextMessage(normalizeMessagePayload(args));
    } catch {
      this.messageQueue.fail(
        new AgentCenterProtocolError("Expected the realtime websocket to deliver text or JSON."),
      );
      this.close();
      return;
    }

    const parsed = parseRealtimeServerMessage(textPayload);

    if (!parsed.success) {
      this.messageQueue.fail(new AgentCenterProtocolError(parsed.error));
      this.close();
      return;
    }

    this.messageQueue.push(parsed.data);
  }

  private async send(message: RealtimeClientMessage): Promise<void> {
    await this.connect();

    if (this.socket === null) {
      throw new AgentCenterRealtimeError("The realtime websocket is not connected.");
    }

    try {
      this.socket.send(serializeRealtimeClientMessage(message));
    } catch (error) {
      throw new AgentCenterRealtimeError("Failed to send a realtime websocket message.", error);
    }
  }
}

export class RunEventStream implements AsyncIterable<RunEvent> {
  private readonly realtimeClient: RunEventsRealtimeClient;
  readonly runId: string;

  constructor(realtimeClient: RunEventsRealtimeClient, runId: string) {
    this.realtimeClient = realtimeClient;
    this.runId = runId;
  }

  async connect(): Promise<this> {
    await this.realtimeClient.subscribe(this.runId);
    return this;
  }

  async ping(): Promise<void> {
    await this.realtimeClient.ping();
  }

  async close(): Promise<void> {
    this.realtimeClient.close();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<RunEvent> {
    await this.connect();

    try {
      for await (const message of this.realtimeClient) {
        if (message.type === "error") {
          throw new AgentCenterRealtimeError(message.message);
        }

        if (message.type === "run_event" && message.runId === this.runId) {
          yield message.event;
        }
      }
    } finally {
      this.realtimeClient.close();
    }
  }
}

function getDefaultWebSocketFactory(): RealtimeSocketFactory {
  if (typeof globalThis.WebSocket !== "function") {
    throw new AgentCenterRealtimeError(
      "No global WebSocket implementation was found. Pass a webSocketFactory in the client options.",
    );
  }

  return (url) => new globalThis.WebSocket(url);
}

function addSocketListener(
  socket: RealtimeSocketLike,
  eventName: "close" | "error" | "message" | "open",
  listener: (...args: unknown[]) => void,
) {
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(eventName, listener);

    return () => {
      socket.removeEventListener?.(eventName, listener);
    };
  }

  if (typeof socket.on === "function") {
    socket.on(eventName, listener);

    return () => {
      if (typeof socket.off === "function") {
        socket.off(eventName, listener);
        return;
      }

      socket.removeListener?.(eventName, listener);
    };
  }

  throw new AgentCenterRealtimeError(
    "The provided websocket does not support addEventListener or on/off style listeners.",
  );
}

function normalizeMessagePayload(args: unknown[]): unknown {
  const [first] = args;

  if (
    isRecord(first) &&
    "data" in first &&
    (typeof first.data === "string" ||
      first.data instanceof Blob ||
      first.data instanceof ArrayBuffer ||
      ArrayBuffer.isView(first.data))
  ) {
    return first.data;
  }

  return first;
}

function normalizeCloseDetails(args: unknown[]) {
  const [first, second] = args;

  if (isRecord(first) && typeof first.code === "number") {
    return {
      code: first.code,
      reason:
        typeof first.reason === "string" && first.reason.length > 0 ? first.reason : undefined,
    };
  }

  if (typeof first === "number") {
    return {
      code: first,
      reason: normalizeCloseReason(second),
    };
  }

  return undefined;
}

function normalizeCloseReason(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (value instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(value);

    return decoded.length > 0 ? decoded : undefined;
  }

  return undefined;
}

async function toTextMessage(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Blob) {
    return await data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }

  throw new AgentCenterProtocolError("Expected a text websocket message.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
