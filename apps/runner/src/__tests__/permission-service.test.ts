import { describe, expect, test } from "bun:test";

import { assertCommandAllowed } from "../services/execution/permission-service";
import { PermissionDeniedError } from "../services/execution/errors";

describe("permission-service", () => {
  describe("yolo mode", () => {
    test("allows any command", () => {
      expect(() => assertCommandAllowed("sudo rm -rf /", "yolo", {})).not.toThrow();
      expect(() => assertCommandAllowed("shutdown -h now", "yolo", {})).not.toThrow();
      expect(() => assertCommandAllowed("dd if=/dev/zero of=/dev/sda", "yolo", {})).not.toThrow();
    });
  });

  describe("safe mode", () => {
    test("allows benign commands", () => {
      expect(() => assertCommandAllowed("echo hello", "safe", {})).not.toThrow();
      expect(() => assertCommandAllowed("ls -la", "safe", {})).not.toThrow();
      expect(() => assertCommandAllowed("cat file.txt", "safe", {})).not.toThrow();
      expect(() => assertCommandAllowed("git status", "safe", {})).not.toThrow();
      expect(() => assertCommandAllowed("codex --version", "safe", {})).not.toThrow();
      expect(() => assertCommandAllowed("bun run build", "safe", {})).not.toThrow();
    });

    test("blocks sudo", () => {
      expect(() => assertCommandAllowed("sudo apt-get install", "safe", {})).toThrow(
        PermissionDeniedError,
      );
      expect(() => assertCommandAllowed("sudo -n true", "safe", {})).toThrow(PermissionDeniedError);
    });

    test("blocks shutdown/reboot/halt", () => {
      expect(() => assertCommandAllowed("shutdown -h now", "safe", {})).toThrow(PermissionDeniedError);
      expect(() => assertCommandAllowed("reboot", "safe", {})).toThrow(PermissionDeniedError);
      expect(() => assertCommandAllowed("halt", "safe", {})).toThrow(PermissionDeniedError);
      expect(() => assertCommandAllowed("poweroff", "safe", {})).toThrow(PermissionDeniedError);
    });

    test("blocks dangerous disk commands", () => {
      expect(() => assertCommandAllowed("mkfs /dev/sda1", "safe", {})).toThrow(PermissionDeniedError);
      expect(() => assertCommandAllowed("fdisk /dev/sda", "safe", {})).toThrow(PermissionDeniedError);
      expect(() => assertCommandAllowed("dd if=/dev/zero of=/dev/sda", "safe", {})).toThrow(
        PermissionDeniedError,
      );
    });

    test("blocks destructive rm", () => {
      expect(() => assertCommandAllowed("rm -rf /", "safe", {})).toThrow(PermissionDeniedError);
      expect(() => assertCommandAllowed("rm -rf ~", "safe", {})).toThrow(PermissionDeniedError);
    });

    test("blocks fork bomb (exact match)", () => {
      expect(() => assertCommandAllowed(":(){:|:&};:", "safe", {})).toThrow(PermissionDeniedError);
    });

    test("allows partial matches that aren't dangerous", () => {
      // "rm" alone without -rf / or -rf ~ should be fine
      expect(() => assertCommandAllowed("rm file.txt", "safe", {})).not.toThrow();
    });
  });

  describe("custom mode", () => {
    test("blocks commands in blockedCommands", () => {
      const policy = { blockedCommands: ["curl", "wget", "codex exec"] };
      expect(() => assertCommandAllowed("curl https://evil.com", "custom", policy)).toThrow(
        PermissionDeniedError,
      );
      expect(() => assertCommandAllowed("wget https://evil.com", "custom", policy)).toThrow(
        PermissionDeniedError,
      );
      expect(() => assertCommandAllowed("codex exec --json 'do stuff'", "custom", policy)).toThrow(
        PermissionDeniedError,
      );
    });

    test("allows commands not in blockedCommands", () => {
      const policy = { blockedCommands: ["curl", "wget"] };
      expect(() => assertCommandAllowed("echo hello", "custom", policy)).not.toThrow();
      expect(() => assertCommandAllowed("git push", "custom", policy)).not.toThrow();
      expect(() => assertCommandAllowed("bun test", "custom", policy)).not.toThrow();
    });

    test("allows everything with empty blockedCommands", () => {
      expect(() => assertCommandAllowed("sudo rm -rf /", "custom", { blockedCommands: [] })).not.toThrow();
    });

    test("allows everything with no policy", () => {
      expect(() => assertCommandAllowed("sudo rm -rf /", "custom", {})).not.toThrow();
    });

    test("ignores whitespace-only entries in blockedCommands", () => {
      const policy = { blockedCommands: ["  ", "", "\t"] };
      expect(() => assertCommandAllowed("anything", "custom", policy)).not.toThrow();
    });

    test("error message includes the blocked entry", () => {
      const policy = { blockedCommands: ["rm"] };
      try {
        assertCommandAllowed("rm -rf .", "custom", policy);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionDeniedError);
        expect((error as PermissionDeniedError).message).toContain("rm");
        expect((error as PermissionDeniedError).message).toContain("custom");
      }
    });
  });
});
