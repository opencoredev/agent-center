import {
  EVENT_TYPES,
  PERMISSION_MODES,
  REPO_PROVIDERS,
  RUN_STATUSES,
  SANDBOX_SIZES,
  TASK_STATUSES,
  type EventType,
  type PermissionMode,
  type RepoProvider,
  type RunStatus,
  type SandboxSize,
  type TaskStatus,
} from "@agent-center/shared";
import { pgEnum } from "drizzle-orm/pg-core";

function enumValues<TValue extends string>(values: readonly [TValue, ...TValue[]]) {
  return [...values] as [TValue, ...TValue[]];
}

export const taskStatusEnum = pgEnum("task_status", enumValues(TASK_STATUSES));
export const runStatusEnum = pgEnum("run_status", enumValues(RUN_STATUSES));
export const sandboxSizeEnum = pgEnum("sandbox_size", enumValues(SANDBOX_SIZES));
export const permissionModeEnum = pgEnum("permission_mode", enumValues(PERMISSION_MODES));
export const repoProviderEnum = pgEnum("repo_provider", enumValues(REPO_PROVIDERS));
export const eventTypeEnum = pgEnum("event_type", enumValues(EVENT_TYPES));

export type TaskStatusValue = TaskStatus;
export type RunStatusValue = RunStatus;
export type SandboxSizeValue = SandboxSize;
export type PermissionModeValue = PermissionMode;
export type RepoProviderValue = RepoProvider;
export type EventTypeValue = EventType;
