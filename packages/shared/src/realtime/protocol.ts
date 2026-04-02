import type { RunEventSpec } from "../domain";

type ParseSuccess<TData> = {
  success: true;
  data: TData;
};

type ParseFailure = {
  success: false;
  error: string;
};

export type RealtimeParseResult<TData> = ParseSuccess<TData> | ParseFailure;

export const REALTIME_CLIENT_MESSAGE_TYPES = ["subscribe_run", "unsubscribe_run", "subscribe_tasks", "unsubscribe_tasks", "ping"] as const;

export const REALTIME_SERVER_MESSAGE_TYPES = ["subscribed", "run_event", "tasks_changed", "error", "pong"] as const;

export interface SubscribeRunMessage {
  type: "subscribe_run";
  runId: string;
}

export interface UnsubscribeRunMessage {
  type: "unsubscribe_run";
  runId: string;
}

export interface SubscribeTasksMessage {
  type: "subscribe_tasks";
}

export interface UnsubscribeTasksMessage {
  type: "unsubscribe_tasks";
}

export interface PingMessage {
  type: "ping";
}

export type RealtimeClientMessage =
  | SubscribeRunMessage
  | UnsubscribeRunMessage
  | SubscribeTasksMessage
  | UnsubscribeTasksMessage
  | PingMessage;

export interface SubscribedMessage {
  type: "subscribed";
  runId: string;
}

export interface RunEventMessage {
  type: "run_event";
  runId: string;
  event: RunEventSpec;
}

export interface RealtimeErrorMessage {
  type: "error";
  message: string;
}

export interface TasksChangedMessage {
  type: "tasks_changed";
}

export interface PongMessage {
  type: "pong";
}

export type RealtimeServerMessage =
  | SubscribedMessage
  | RunEventMessage
  | TasksChangedMessage
  | RealtimeErrorMessage
  | PongMessage;

export function parseRealtimeClientMessage(
  payload: string,
): RealtimeParseResult<RealtimeClientMessage> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return {
      success: false,
      error: "Expected a JSON object message.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      success: false,
      error: "Expected a JSON object message.",
    };
  }

  const { type } = parsed;

  if (type === "ping") {
    return {
      success: true,
      data: {
        type: "ping",
      },
    };
  }

  if (type === "subscribe_tasks") {
    return {
      success: true,
      data: {
        type: "subscribe_tasks",
      },
    };
  }

  if (type === "unsubscribe_tasks") {
    return {
      success: true,
      data: {
        type: "unsubscribe_tasks",
      },
    };
  }

  if (type === "subscribe_run" || type === "unsubscribe_run") {
    const { runId } = parsed;

    if (typeof runId !== "string" || runId.length === 0) {
      return {
        success: false,
        error: "Expected a non-empty runId string.",
      };
    }

    return {
      success: true,
      data: {
        type,
        runId,
      },
    };
  }

  return {
    success: false,
    error: "Unsupported realtime message type.",
  };
}

export function serializeRealtimeServerMessage(message: RealtimeServerMessage): string {
  return JSON.stringify(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
