import { describe, expect, test } from "bun:test";

import { InternalApiAuthError, fetchInternalApiJson, type InternalApiFetch } from "../lib/internal-api";

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
});
