import { afterEach, describe, expect, mock, test } from "bun:test";

import { executeCliAgent } from "../services/execution/cli-agent-executor";
import { buildCursorCommand } from "../services/execution/cursor-executor";
import { buildOpenCodeCommand } from "../services/execution/opencode-executor";

const originalSpawn = Bun.spawn;

afterEach(() => {
  (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
});

describe("host-auth CLI executors", () => {
  test("builds OpenCode run command", () => {
    expect(buildOpenCodeCommand({ prompt: "fix the tests" })).toEqual([
      "opencode",
      "run",
      "fix the tests",
    ]);
  });

  test("builds OpenCode run command with model", () => {
    expect(buildOpenCodeCommand({ model: "provider/model", prompt: "fix the tests" })).toEqual([
      "opencode",
      "run",
      "--model",
      "provider/model",
      "fix the tests",
    ]);
  });

  test("builds Cursor agent print command", () => {
    expect(buildCursorCommand({ prompt: "fix the tests" })).toEqual([
      "cursor-agent",
      "-p",
      "fix the tests",
    ]);
  });

  test("builds Cursor agent print command with model", () => {
    expect(buildCursorCommand({ model: "gpt-5", prompt: "fix the tests" })).toEqual([
      "cursor-agent",
      "--model",
      "gpt-5",
      "-p",
      "fix the tests",
    ]);
  });

  test("throws on nonzero CLI exit", async () => {
    (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = mock(() => ({
      exited: Promise.resolve(42),
      stderr: null,
      stdout: null,
    })) as unknown as typeof Bun.spawn;

    await expect(
      executeCliAgent(
        {
          binaryName: "example-agent",
          buildCommand: () => ["example-agent", "run"],
          displayName: "Example",
          loginCommand: "example-agent login",
        },
        {
          cwd: "/tmp",
          onEvent: async () => undefined,
          prompt: "fix the tests",
        },
      ),
    ).rejects.toThrow("Example exited with code 42");
  });

  test("throws an actionable error when the CLI binary is missing", async () => {
    (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = mock(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }) as unknown as typeof Bun.spawn;

    await expect(
      executeCliAgent(
        {
          binaryName: "example-agent",
          buildCommand: () => ["example-agent", "run"],
          displayName: "Example",
          loginCommand: "example-agent login",
        },
        {
          cwd: "/tmp",
          onEvent: async () => undefined,
          prompt: "fix the tests",
        },
      ),
    ).rejects.toThrow(
      'Example CLI binary "example-agent" was not found on the runner host. Install it and run `example-agent login`',
    );
  });
});
