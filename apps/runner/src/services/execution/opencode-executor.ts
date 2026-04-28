import {
  type CliAgentExecutionHandle,
  type CliAgentExecutionRequest,
  type CliAgentExecutionResult,
  executeCliAgent,
  startCliAgent,
} from "./cli-agent-executor";

const OPENCODE_DEFINITION = {
  displayName: "OpenCode",
  binaryName: "opencode",
  loginCommand: "opencode auth login",
  buildCommand: buildOpenCodeCommand,
};

export type OpenCodeExecutionRequest = CliAgentExecutionRequest;
export type OpenCodeExecutionResult = CliAgentExecutionResult;
export type OpenCodeExecutionHandle = CliAgentExecutionHandle;

export function buildOpenCodeCommand(request: Pick<OpenCodeExecutionRequest, "model" | "prompt">) {
  const command = ["opencode", "run"];

  if (request.model) {
    command.push("--model", request.model);
  }

  command.push(request.prompt);
  return command;
}

export function startOpenCodeAgent(request: OpenCodeExecutionRequest): OpenCodeExecutionHandle {
  return startCliAgent(OPENCODE_DEFINITION, request);
}

export function executeOpenCodeAgent(
  request: OpenCodeExecutionRequest,
): Promise<OpenCodeExecutionResult> {
  return executeCliAgent(OPENCODE_DEFINITION, request);
}
