import { describe, expect, test } from "bun:test";

import { redactSensitiveData, redactString } from "../lib/redaction";

describe("redaction", () => {
  test("redacts sensitive object keys recursively without changing shape", () => {
    const result = redactSensitiveData({
      apiVersion: "2026-04-28",
      id: "event-1",
      nested: {
        accessToken: "oauth-access-token-1234567890",
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
      },
      outputs: [
        "ok",
        {
          idToken: "header.payload.signature-token-token-token",
          stream: "stdout",
        },
      ],
    });

    expect(result).toEqual({
      apiVersion: "2026-04-28",
      id: "event-1",
      nested: {
        accessToken: "[REDACTED]",
        authorization: "[REDACTED]",
      },
      outputs: [
        "ok",
        {
          idToken: "[REDACTED]",
          stream: "stdout",
        },
      ],
    });
  });

  test("redacts token-looking values inside strings", () => {
    expect(
      redactString(
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz sk-test-secret1234567890 sess_abcdefghijklmnopqrstuvwxyz",
      ),
    ).toBe("Authorization: Bearer [REDACTED] [REDACTED] [REDACTED]");
  });
});
