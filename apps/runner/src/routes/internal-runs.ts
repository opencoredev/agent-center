import type { ExecuteRunRequest, RunControlRequest } from "../internal/protocol";
import type { RunnerControlService } from "../services/internal/runner-control-service";

class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseOptionalJson(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength === "0") {
    return {};
  }

  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new InvalidRequestError("Request body must be valid JSON");
  }

  return isObject(parsed) ? parsed : {};
}

function parseExecuteBody(body: unknown): ExecuteRunRequest {
  if (!isObject(body) || typeof body.runId !== "string" || body.runId.trim().length === 0) {
    throw new InvalidRequestError("Request body must include a non-empty runId");
  }

  return {
    runId: body.runId,
  };
}

function parseControlBody(body: unknown): RunControlRequest {
  if (!isObject(body)) {
    return {};
  }

  return {
    reason: typeof body.reason === "string" ? body.reason : body.reason === null ? null : undefined,
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
  });
}

function errorResponse(error: unknown, status: number, fallback: string) {
  return jsonResponse(
    {
      error: error instanceof Error ? error.message : fallback,
    },
    status,
  );
}

function executeErrorResponse(error: unknown) {
  if (error instanceof InvalidRequestError) {
    return jsonResponse(
      {
        error: "invalid_execute_request",
      },
      400,
    );
  }

  if (error instanceof Error) {
    if (error.message.includes("could not be loaded") || error.message.includes("was not found")) {
      return jsonResponse(
        {
          error: "run_not_found",
        },
        404,
      );
    }

    if (error.message.includes("already")) {
      return jsonResponse(
        {
          error: "run_not_dispatchable",
        },
        409,
      );
    }

    if (error.message.includes("EXECUTION_BACKEND=e2b does not support")) {
      return jsonResponse(
        {
          error: "unsupported_execution_backend",
          message: error.message,
        },
        422,
      );
    }
  }

  return jsonResponse(
    {
      error: "runner_dispatch_failed",
    },
    500,
  );
}

function getRunIdFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments[2] ?? null;
}

export async function handleInternalRunsRequest(
  request: Request,
  url: URL,
  controlService: RunnerControlService,
) {
  if (
    request.method === "POST" &&
    (url.pathname === "/internal/runs/execute" || url.pathname === "/internal/runs/dispatch")
  ) {
    try {
      const input = parseExecuteBody(await parseOptionalJson(request));
      return jsonResponse(await controlService.dispatch(input.runId), 202);
    } catch (error) {
      return executeErrorResponse(error);
    }
  }

  const runId = getRunIdFromPath(url.pathname);
  if (!runId) {
    return errorResponse(new Error("Run id is required"), 404, "Run id is required");
  }

  if (request.method === "GET" && url.pathname === `/internal/runs/${runId}`) {
    try {
      return jsonResponse(await controlService.getSnapshot(runId));
    } catch (error) {
      return errorResponse(error, 404, "Run not found");
    }
  }

  const controlInput = parseControlBody(await parseOptionalJson(request));

  try {
    if (request.method === "POST" && url.pathname === `/internal/runs/${runId}/pause`) {
      return jsonResponse(await controlService.pause(runId, controlInput));
    }

    if (request.method === "POST" && url.pathname === `/internal/runs/${runId}/resume`) {
      return jsonResponse(await controlService.resume(runId, controlInput));
    }

    if (request.method === "POST" && url.pathname === `/internal/runs/${runId}/cancel`) {
      return jsonResponse(await controlService.cancel(runId, controlInput));
    }
  } catch (error) {
    return errorResponse(error, 409, "Runner control request failed");
  }

  return errorResponse(new Error("Not found"), 404, "Not found");
}
