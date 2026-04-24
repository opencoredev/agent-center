import { describe, expect, test } from "bun:test";

import { buildChildProcessEnv } from "../services/execution/command-executor";

describe("buildChildProcessEnv", () => {
  test("does not include runner or provider secrets from the host environment", () => {
    const previousRunnerToken = process.env.RUNNER_API_TOKEN;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const previousDatabaseUrl = process.env.DATABASE_URL;

    process.env.RUNNER_API_TOKEN = "runner-secret";
    process.env.OPENAI_API_KEY = "openai-secret";
    process.env.DATABASE_URL = "postgres://secret";

    try {
      const env = buildChildProcessEnv(undefined);

      expect(env.RUNNER_API_TOKEN).toBeUndefined();
      expect(env.OPENAI_API_KEY).toBeUndefined();
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.PATH).toBeTruthy();
    } finally {
      if (previousRunnerToken === undefined) {
        delete process.env.RUNNER_API_TOKEN;
      } else {
        process.env.RUNNER_API_TOKEN = previousRunnerToken;
      }

      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }

      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  test("keeps explicitly requested workload environment values", () => {
    const env = buildChildProcessEnv({
      DATABASE_URL: "postgres://explicit",
      RUNNER_API_TOKEN: "explicit-runner-token",
    });

    expect(env.DATABASE_URL).toBe("postgres://explicit");
    expect(env.RUNNER_API_TOKEN).toBe("explicit-runner-token");
  });
});
