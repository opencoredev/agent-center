import type { Id } from "@agent-center/control-plane/data-model";

type TableName =
  | "automations"
  | "projects"
  | "repoConnections"
  | "runnerRegistrationTokens"
  | "runners"
  | "runEvents"
  | "runs"
  | "tasks"
  | "users"
  | "workspaces";

export function asConvexId<Table extends TableName>(id: string) {
  return id as Id<Table>;
}

export function toTimestamp(value: Date | number | string) {
  return value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : value;
}

export function normalizeConvexInput<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? value.getTime() : value]),
  ) as T;
}

export function asConvexArgs<T extends Record<string, unknown>>(values: T) {
  return normalizeConvexInput(values) as any;
}
