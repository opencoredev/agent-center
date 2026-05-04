import { describe, expect, test } from "bun:test";

import {
  InternalApiAuthError,
  InternalApiError,
  fetchInternalApiJson,
  type InternalApiFetch,
} from "../lib/internal-api";

describe("internal-api", () => {
  test("sends bearer auth when token is configured", async () => {
    let callCount = 0;
    const fetchImpl: InternalApiFetch = async (_url, init) => {
      callCount += 1;
      const headers = init?.headers;
      expect(headers instanceof Headers).toBe(true);
      if (!(headers instanceof Headers)) {
        throw new Error("Expected request headers to be a Headers instance");
      }
      expect(headers.get("authorization")).toBe("Bearer runner-token");
      expect(headers.get("accept")).toBe("application/json");
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const data = await fetchInternalApiJson<{ data: { ok: boolean } }>(
      "/internal/credentials/openai/resolve",
      undefined,
      {
        baseUrl: "http://api.example.test",
        fetchImpl,
        token: "runner-token",
      },
    );

    expect(data).toEqual({ data: { ok: true } });
    expect(callCount).toBe(1);
  });

  test("surfaces auth failures clearly", async () => {
    const fetchImpl: InternalApiFetch = async () => {
      return new Response("unauthorized", { status: 401, statusText: "Unauthorized" });
    };

    await expect(
      fetchInternalApiJson("/internal/credentials/claude/resolve", undefined, {
        baseUrl: "http://api.example.test",
        fetchImpl,
        token: "runner-token",
      }),
    ).rejects.toBeInstanceOf(InternalApiAuthError);
  });

  test("preserves structured auth codes outside credential routes", async () => {
    const fetchImpl: InternalApiFetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "runner_unauthorized",
            message: "Invalid or revoked runner token",
          },
          requestId: "req-test",
        }),
        { status: 401, statusText: "Unauthorized" },
      );
    };

    try {
      await fetchInternalApiJson(
        "/internal/github/repo-connections/repo-1/installation-token",
        undefined,
        {
          baseUrl: "http://api.example.test",
          fetchImpl,
          token: "stale-runner-token",
        },
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InternalApiAuthError);
      const internalError = error as InternalApiAuthError;
      expect(internalError.code).toBe("runner_unauthorized");
      expect(internalError.body).toContain("Invalid or revoked runner token");
    }
  });

  test("does not expose credential route response bodies on errors", async () => {
    const fetchImpl: InternalApiFetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "no_runner_openai_credentials",
            details: {
              provider: "openai",
              leaked: "sk-test-secret1234567890",
            },
            message: "secret body sk-test-secret1234567890",
          },
        }),
        { status: 422, statusText: "Unprocessable Entity" },
      );
    };

    try {
      await fetchInternalApiJson("/internal/credentials/openai/resolve", undefined, {
        baseUrl: "http://api.example.test",
        fetchImpl,
        token: "runner-token",
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InternalApiError);
      const internalError = error as InternalApiError;
      expect(internalError.body).toBeNull();
      expect(internalError.code).toBe("no_runner_openai_credentials");
      expect(internalError.provider).toBe("openai");
      expect(internalError.message).not.toContain("sk-test-secret");
      expect(internalError.message).not.toContain("secret body");
    }
  });
});
