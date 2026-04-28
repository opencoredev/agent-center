import {
  type CliAgentExecutionHandle,
  type CliAgentExecutionRequest,
  type CliAgentExecutionResult,
  executeCliAgent,
  startCliAgent,
} from "./cli-agent-executor";

const CURSOR_DEFINITION = {
  displayName: "Cursor",
  binaryName: "cursor-agent",
  loginCommand: "cursor-agent login",
  buildCommand: buildCursorCommand,
};

export type CursorExecutionRequest = CliAgentExecutionRequest;
export type CursorExecutionResult = CliAgentExecutionResult;
export type CursorExecutionHandle = CliAgentExecutionHandle;

export function buildCursorCommand(request: Pick<CursorExecutionRequest, "model" | "prompt">) {
  const command = ["cursor-agent"];

  if (request.model) {
    command.push("--model", request.model);
  }

  command.push("-p", request.prompt);
  return command;
}

export function startCursorAgent(request: CursorExecutionRequest): CursorExecutionHandle {
  return startCliAgent(CURSOR_DEFINITION, request);
}

export function executeCursorAgent(
  request: CursorExecutionRequest,
): Promise<CursorExecutionResult> {
  return executeCliAgent(CURSOR_DEFINITION, request);
}
