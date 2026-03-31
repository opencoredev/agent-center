import { describe, expect, test } from "bun:test";

import {
  executionCommandSchema,
  executionConfigSchema,
  executionPolicySchema,
  permissionModeSchema,
  sandboxSizeSchema,
  slugSchema,
  uuidSchema,
} from "../validators/common";
import { createTaskSchema } from "../validators/tasks";
import { createRunSchema } from "../validators/runs";

describe("common validators", () => {
  describe("uuidSchema", () => {
    test("accepts valid UUIDs", () => {
      expect(() => uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")).not.toThrow();
    });

    test("rejects invalid UUIDs", () => {
      expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
      expect(() => uuidSchema.parse("")).toThrow();
    });
  });

  describe("slugSchema", () => {
    test("accepts valid slugs", () => {
      expect(slugSchema.parse("my-project")).toBe("my-project");
      expect(slugSchema.parse("test123")).toBe("test123");
      expect(slugSchema.parse("a")).toBe("a");
    });

    test("rejects invalid slugs", () => {
      expect(() => slugSchema.parse("My Project")).toThrow();
      expect(() => slugSchema.parse("has_underscores")).toThrow();
      expect(() => slugSchema.parse("")).toThrow();
      expect(() => slugSchema.parse("UPPERCASE")).toThrow();
    });
  });

  describe("sandboxSizeSchema", () => {
    test("accepts valid sizes", () => {
      expect(sandboxSizeSchema.parse("small")).toBe("small");
      expect(sandboxSizeSchema.parse("medium")).toBe("medium");
      expect(sandboxSizeSchema.parse("large")).toBe("large");
    });

    test("rejects invalid sizes", () => {
      expect(() => sandboxSizeSchema.parse("xlarge")).toThrow();
    });
  });

  describe("permissionModeSchema", () => {
    test("accepts valid modes", () => {
      expect(permissionModeSchema.parse("yolo")).toBe("yolo");
      expect(permissionModeSchema.parse("safe")).toBe("safe");
      expect(permissionModeSchema.parse("custom")).toBe("custom");
    });

    test("rejects invalid modes", () => {
      expect(() => permissionModeSchema.parse("strict")).toThrow();
    });
  });
});

describe("executionConfigSchema", () => {
  test("accepts config with agentProvider", () => {
    const result = executionConfigSchema.parse({
      agentProvider: "claude",
      agentModel: "claude-sonnet-4-5",
      agentPrompt: "Do something useful",
      commands: [],
    });
    expect(result.agentProvider).toBe("claude");
    expect(result.agentModel).toBe("claude-sonnet-4-5");
    expect(result.agentPrompt).toBe("Do something useful");
  });

  test("defaults agentProvider to none", () => {
    const result = executionConfigSchema.parse({});
    expect(result.agentProvider).toBe("none");
    expect(result.commands).toEqual([]);
  });

  test("accepts codex provider", () => {
    const result = executionConfigSchema.parse({ agentProvider: "codex" });
    expect(result.agentProvider).toBe("codex");
  });

  test("rejects invalid provider", () => {
    expect(() => executionConfigSchema.parse({ agentProvider: "gpt5" })).toThrow();
  });

  test("accepts config with commands and agent", () => {
    const result = executionConfigSchema.parse({
      agentProvider: "claude",
      commands: [{ command: "cat result.txt" }],
    });
    expect(result.agentProvider).toBe("claude");
    expect(result.commands).toHaveLength(1);
  });

  test("accepts config with commit/PR fields", () => {
    const result = executionConfigSchema.parse({
      commitMessage: "fix: something",
      prTitle: "Fix something",
      prBody: "This fixes the thing",
    });
    expect(result.commitMessage).toBe("fix: something");
    expect(result.prTitle).toBe("Fix something");
  });

  test("rejects unknown fields", () => {
    expect(() =>
      executionConfigSchema.parse({ unknownField: "value" }),
    ).toThrow();
  });
});

describe("executionPolicySchema", () => {
  test("accepts blockedCommands", () => {
    const result = executionPolicySchema.parse({
      blockedCommands: ["rm", "curl"],
    });
    expect(result.blockedCommands).toEqual(["rm", "curl"]);
  });

  test("accepts empty policy", () => {
    const result = executionPolicySchema.parse({});
    expect(result).toEqual({});
  });

  test("accepts writablePaths", () => {
    const result = executionPolicySchema.parse({
      writablePaths: ["/tmp", "/var/log"],
    });
    expect(result.writablePaths).toEqual(["/tmp", "/var/log"]);
  });
});

describe("executionCommandSchema", () => {
  test("accepts command with all fields", () => {
    const result = executionCommandSchema.parse({
      command: "echo hello",
      cwd: "/tmp",
      env: { FOO: "bar" },
      timeoutSeconds: 30,
    });
    expect(result.command).toBe("echo hello");
    expect(result.cwd).toBe("/tmp");
    expect(result.env).toEqual({ FOO: "bar" });
    expect(result.timeoutSeconds).toBe(30);
  });

  test("accepts minimal command", () => {
    const result = executionCommandSchema.parse({ command: "ls" });
    expect(result.command).toBe("ls");
  });

  test("rejects empty command", () => {
    expect(() => executionCommandSchema.parse({ command: "" })).toThrow();
  });

  test("rejects missing command", () => {
    expect(() => executionCommandSchema.parse({})).toThrow();
  });
});

describe("createTaskSchema", () => {
  const validTask = {
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    title: "Test task",
    prompt: "Do something",
  };

  test("accepts minimal task", () => {
    const result = createTaskSchema.parse(validTask);
    expect(result.title).toBe("Test task");
    expect(result.permissionMode).toBe("safe");
    expect(result.sandboxSize).toBe("medium");
    expect(result.config.agentProvider).toBe("none");
  });

  test("accepts task with claude agent", () => {
    const result = createTaskSchema.parse({
      ...validTask,
      config: {
        agentProvider: "claude",
        agentModel: "claude-sonnet-4-5",
        commands: [{ command: "cat output.txt" }],
      },
    });
    expect(result.config.agentProvider).toBe("claude");
    expect(result.config.agentModel).toBe("claude-sonnet-4-5");
    expect(result.config.commands).toHaveLength(1);
  });

  test("rejects repoConnectionId without projectId", () => {
    expect(() =>
      createTaskSchema.parse({
        ...validTask,
        repoConnectionId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).toThrow();
  });
});

describe("createRunSchema", () => {
  test("accepts minimal run", () => {
    const result = createRunSchema.parse({
      taskId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.taskId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  test("accepts run with agent override", () => {
    const result = createRunSchema.parse({
      taskId: "550e8400-e29b-41d4-a716-446655440000",
      config: {
        agentProvider: "claude",
        agentModel: "claude-opus-4-6",
        commands: [],
      },
    });
    expect(result.config!.agentProvider).toBe("claude");
    expect(result.config!.agentModel).toBe("claude-opus-4-6");
  });

  test("accepts run with branch override", () => {
    const result = createRunSchema.parse({
      taskId: "550e8400-e29b-41d4-a716-446655440000",
      branchName: "feature/test",
    });
    expect(result.branchName).toBe("feature/test");
  });
});
