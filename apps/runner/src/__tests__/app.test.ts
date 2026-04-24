import { describe, expect, mock, test } from "bun:test";

import { createApp } from "../app";
import type { RunnerControlService } from "../services/internal/runner-control-service";

function createControlService() {
  return {
    dispatch: mock(async (runId: string) => ({
      accepted: true,
      alreadyActive: false,
      snapshot: {
        active: true,
        cancelRequested: false,
        currentCommand: null,
        paused: false,
        phase: "running",
        runId,
        startedAt: new Date(0).toISOString(),
        status: "running",
        workspacePath: null,
      },
    })),
  } as unknown as RunnerControlService;
}

describe("createApp", () => {
  test("keeps health public", async () => {
    const app = createApp(createControlService(), {
      internalAuthToken: "test-token",
    });

    const response = await app.fetch(new Request("http://runner.test/health"));

    expect(response.status).toBe(200);
  });

  test("rejects internal run requests without a bearer token", async () => {
    const controlService = createControlService();
    const app = createApp(controlService, {
      internalAuthToken: "test-token",
    });

    const response = await app.fetch(
      new Request("http://runner.test/internal/runs/execute", {
        body: JSON.stringify({ runId: "run-1" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(controlService.dispatch).not.toHaveBeenCalled();
  });

  test("accepts internal run requests with the configured bearer token", async () => {
    const controlService = createControlService();
    const app = createApp(controlService, {
      internalAuthToken: "test-token",
    });

    const response = await app.fetch(
      new Request("http://runner.test/internal/runs/execute", {
        body: JSON.stringify({ runId: "run-1" }),
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    expect(controlService.dispatch).toHaveBeenCalledWith("run-1");
  });
});
