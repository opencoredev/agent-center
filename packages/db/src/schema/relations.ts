import { relations } from "drizzle-orm";

import { apiKeys } from "./api-keys";
import { automations } from "./automations";
import { credentials } from "./credentials";
import { projects } from "./projects";
import { repoConnections } from "./repo-connections";
import { runEvents } from "./run-events";
import { runs } from "./runs";
import { sessions } from "./sessions";
import { tasks } from "./tasks";
import { users } from "./users";
import { workspaces } from "./workspaces";

// ── Users ─────────────────────────────────────────────────────────────────

export const userRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  credentials: many(credentials),
  sessions: many(sessions),
  workspaces: many(workspaces),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const credentialRelations = relations(credentials, ({ one }) => ({
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}));

// ── Workspaces ────────────────────────────────────────────────────────────

export const workspaceRelations = relations(workspaces, ({ many, one }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  automations: many(automations),
  projects: many(projects),
  repoConnections: many(repoConnections),
  tasks: many(tasks),
}));

export const projectRelations = relations(projects, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  repoConnections: many(repoConnections),
  tasks: many(tasks),
  automations: many(automations),
}));

export const repoConnectionRelations = relations(repoConnections, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [repoConnections.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [repoConnections.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
  runs: many(runs),
  automations: many(automations),
}));

export const automationRelations = relations(automations, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [automations.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [automations.projectId],
    references: [projects.id],
  }),
  repoConnection: one(repoConnections, {
    fields: [automations.repoConnectionId],
    references: [repoConnections.id],
  }),
  tasks: many(tasks),
}));

export const taskRelations = relations(tasks, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [tasks.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  repoConnection: one(repoConnections, {
    fields: [tasks.repoConnectionId],
    references: [repoConnections.id],
  }),
  automation: one(automations, {
    fields: [tasks.automationId],
    references: [automations.id],
  }),
  runs: many(runs),
}));

export const runRelations = relations(runs, ({ many, one }) => ({
  task: one(tasks, {
    fields: [runs.taskId],
    references: [tasks.id],
  }),
  repoConnection: one(repoConnections, {
    fields: [runs.repoConnectionId],
    references: [repoConnections.id],
  }),
  events: many(runEvents),
}));

export const runEventRelations = relations(runEvents, ({ one }) => ({
  run: one(runs, {
    fields: [runEvents.runId],
    references: [runs.id],
  }),
}));
