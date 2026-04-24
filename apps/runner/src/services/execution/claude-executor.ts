import {
  query,
  type SDKMessage,
  type PermissionMode as SDKPermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

import { buildChildProcessEnv } from "./command-executor";

export interface ClaudeExecutionRequest {
  cwd: string;
  model?: string;
  permissionMode: "yolo" | "safe" | "custom";
  prompt: string;
  env?: Record<string, string>;
  onEvent: (event: ClaudeEvent) => Promise<void> | void;
}

export interface ClaudeEvent {
  type:
    | "session_started"
    | "assistant_message"
    | "tool_use"
    | "tool_result"
    | "result"
    | "error"
    | "log";
  message: string;
  payload?: Record<string, unknown>;
}

export interface ClaudeExecutionResult {
  durationMs: number;
  sessionId: string | null;
  success: boolean;
  error?: string;
}

export interface ClaudeExecutionHandle {
  result: Promise<ClaudeExecutionResult>;
  interrupt: () => void;
  close: () => void;
}

function mapPermissionMode(mode: ClaudeExecutionRequest["permissionMode"]): SDKPermissionMode {
  switch (mode) {
    case "yolo":
      return "bypassPermissions";
    case "safe":
      return "default";
    case "custom":
      return "plan";
  }
}

export function startClaudeAgent(request: ClaudeExecutionRequest): ClaudeExecutionHandle {
  const queryInstance = query({
    prompt: request.prompt,
    options: {
      cwd: request.cwd,
      model: request.model ?? "claude-sonnet-4-5",
      permissionMode: mapPermissionMode(request.permissionMode),
      allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash", "Agent"],
      env: buildChildProcessEnv(request.env),
    },
  });

  const result = runAgent(queryInstance, request);

  return {
    result,
    interrupt: () => queryInstance.interrupt(),
    close: () => queryInstance.close(),
  };
}

async function runAgent(
  queryInstance: AsyncIterable<SDKMessage>,
  request: ClaudeExecutionRequest,
): Promise<ClaudeExecutionResult> {
  const startedAt = Date.now();
  let sessionId: string | null = null;

  try {
    for await (const message of queryInstance) {
      sessionId = (message as any).session_id ?? sessionId;

      if (message.type === "system" && (message as any).subtype === "init") {
        await request.onEvent({
          type: "session_started",
          message: `Claude session started: ${sessionId}`,
          payload: { sessionId: sessionId ?? undefined },
        });
      }

      if (message.type === "assistant") {
        const assistantMsg = (message as any).message;
        if (assistantMsg?.content) {
          const text = assistantMsg.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("");

          if (text) {
            await request.onEvent({
              type: "assistant_message",
              message: text,
              payload: { model: assistantMsg.model },
            });
          }

          for (const block of assistantMsg.content) {
            if (block.type === "tool_use") {
              await request.onEvent({
                type: "tool_use",
                message: `Tool: ${block.name}`,
                payload: { toolName: block.name, toolId: block.id },
              });
            }
          }
        }
      }

      if (message.type === "result") {
        await request.onEvent({
          type: "result",
          message: "Claude session completed",
          payload: { sessionId: sessionId ?? undefined },
        });
      }
    }

    return { durationMs: Date.now() - startedAt, sessionId, success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await request.onEvent({ type: "error", message: msg });
    return { durationMs: Date.now() - startedAt, sessionId, success: false, error: msg };
  }
}

export async function executeClaudeAgent(
  request: ClaudeExecutionRequest,
): Promise<ClaudeExecutionResult> {
  const handle = startClaudeAgent(request);
  return handle.result;
}
