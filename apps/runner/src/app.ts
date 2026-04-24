import { timingSafeEqual } from "node:crypto";

import type { RunnerControlService } from "./services/internal/runner-control-service";
import { handleHealthRequest } from "./routes/health";
import { handleInternalRunsRequest } from "./routes/internal-runs";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isAuthorized(request: Request, expectedToken: string) {
  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return false;
  }

  const encoder = new TextEncoder();
  const bearerBytes = encoder.encode(bearerToken);
  const expectedBytes = encoder.encode(expectedToken);

  return (
    bearerBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(bearerBytes, expectedBytes)
  );
}

function unauthorizedResponse() {
  return Response.json(
    {
      error: "unauthorized",
    },
    {
      headers: {
        "www-authenticate": "Bearer",
      },
      status: 401,
    },
  );
}

export function createApp(
  controlService: RunnerControlService,
  options: { internalAuthToken: string },
) {
  const internalAuthToken = options.internalAuthToken.trim();
  if (!internalAuthToken) {
    throw new Error("RUNNER_INTERNAL_TOKEN is required to protect /internal/runs routes");
  }

  return {
    fetch: (request: Request) => {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return handleHealthRequest();
      }

      if (url.pathname.startsWith("/internal/runs")) {
        if (!isAuthorized(request, internalAuthToken)) {
          return unauthorizedResponse();
        }

        return handleInternalRunsRequest(request, url, controlService);
      }

      return Response.json(
        {
          error: "Not found",
        },
        {
          status: 404,
        },
      );
    },
  };
}
