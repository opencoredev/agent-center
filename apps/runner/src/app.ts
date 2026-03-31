import type { RunnerControlService } from "./services/internal/runner-control-service";
import { handleHealthRequest } from "./routes/health";
import { handleInternalRunsRequest } from "./routes/internal-runs";

export function createApp(controlService: RunnerControlService) {
  return {
    fetch: (request: Request) => {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return handleHealthRequest();
      }

      if (url.pathname.startsWith("/internal/runs")) {
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
