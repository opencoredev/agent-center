export const EVENT_TYPES = [
  "task.created",
  "task.queued",
  "run.created",
  "run.status_changed",
  "run.log",
  "run.command.started",
  "run.command.finished",
  "repo.clone.started",
  "repo.clone.finished",
  "git.commit.created",
  "git.branch.pushed",
  "git.pr.opened",
  "run.completed",
  "run.failed",
  "automation.triggered",
] as const satisfies readonly [string, ...string[]];

export type EventType = (typeof EVENT_TYPES)[number];
