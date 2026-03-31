import type { ExecutionPolicy, PermissionMode } from "@agent-center/shared";

import { PermissionDeniedError } from "./errors";

const SAFE_BLOCKLIST = [
  "sudo",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "mkfs",
  "fdisk",
  "diskutil",
  "launchctl",
  "rm -rf /",
  "rm -rf ~",
  "dd if=",
  ":(){:|:&};:",
] as const;

function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesBlockedEntry(command: string, blockedEntry: string) {
  const normalizedCommand = normalizeCommand(command);
  const normalizedEntry = normalizeCommand(blockedEntry);

  if (normalizedEntry.includes(" ")) {
    return normalizedCommand.includes(normalizedEntry);
  }

  return (
    normalizedCommand === normalizedEntry ||
    normalizedCommand.startsWith(`${normalizedEntry} `) ||
    normalizedCommand.startsWith(`${normalizedEntry}\t`)
  );
}

export function assertCommandAllowed(
  command: string,
  permissionMode: PermissionMode,
  policy: ExecutionPolicy,
) {
  if (permissionMode === "yolo") {
    return;
  }

  const blockedEntries =
    permissionMode === "custom"
      ? (policy.blockedCommands ?? []).filter((entry) => entry.trim().length > 0)
      : [...SAFE_BLOCKLIST];

  for (const blockedEntry of blockedEntries) {
    if (matchesBlockedEntry(command, blockedEntry)) {
      throw new PermissionDeniedError(
        `Command blocked by ${permissionMode} runner policy: ${blockedEntry}`,
      );
    }
  }
}
