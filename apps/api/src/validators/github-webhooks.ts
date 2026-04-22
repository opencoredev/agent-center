import { z } from "zod";

const githubInstallationSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict();

const githubRepositorySchema = z
  .object({
    full_name: z.string().trim().min(1),
    name: z.string().trim().min(1),
    default_branch: z.string().trim().min(1).optional(),
    html_url: z.string().trim().url().optional(),
    owner: z
      .object({
        login: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

const githubIssueSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable().optional(),
    html_url: z.string().trim().url(),
    pull_request: z.unknown().optional(),
  })
  .strict();

const githubCommentSchema = z
  .object({
    id: z.number().int().positive(),
    body: z.string(),
    html_url: z.string().trim().url(),
  })
  .strict();

const githubSenderSchema = z
  .object({
    login: z.string().trim().min(1),
  })
  .strict();

export const githubIssuesOpenedSchema = z
  .object({
    action: z.literal("opened"),
    installation: githubInstallationSchema,
    repository: githubRepositorySchema,
    issue: githubIssueSchema,
    sender: githubSenderSchema.optional(),
  })
  .strict();

export const githubIssueCommentCreatedSchema = z
  .object({
    action: z.literal("created"),
    installation: githubInstallationSchema,
    repository: githubRepositorySchema,
    issue: githubIssueSchema,
    comment: githubCommentSchema,
    sender: githubSenderSchema.optional(),
  })
  .strict();
