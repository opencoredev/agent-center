import { afterEach, describe, expect, mock, test } from "bun:test";

import { createRunnerClient } from "../runner/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createRunnerClient", () => {
  test("requires an internal runner token", () => {
    expect(() =>
      createRunnerClient({
        baseUrl: "http://runner.test",
        dispatchTimeoutMs: 1_000,
        internalAuthToken: "",
      }),
    ).toThrow("RUNNER_INTERNAL_TOKEN");
  });

  test("sends the internal runner bearer token", async () => {
    const captured: { authorizationHeader?: string | null } = {};
    globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
      captured.authorizationHeader = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ accepted: true }), {
        status: 202,
      });
    }) as unknown as typeof fetch;

    const client = createRunnerClient({
      baseUrl: "http://runner.test",
      dispatchTimeoutMs: 1_000,
      internalAuthToken: "test-token",
    });

    await client.dispatchRun({ runId: "run-1" });

    expect(captured.authorizationHeader).toBe("Bearer test-token");
  });
});
