import { createHmac, timingSafeEqual } from "node:crypto";

import type { DomainMetadata, ExecutionConfig } from "@agent-center/shared";
import { z } from "zod";

import { apiEnv } from "../env";
import { ApiError } from "../http/errors";
import { findGitHubAppRepoConnectionByRepository } from "../repositories/repo-connection-repository";
import { findTaskByGitHubDeliveryId } from "../repositories/task-repository";
import { projectService } from "./project-service";
import { runService } from "./run-service";
import { taskService } from "./task-service";
import { githubAppService } from "./github-app-service";
import { githubIssueCommentCreatedSchema, githubIssuesOpenedSchema } from "../validators/github-webhooks";

const DEFAULT_WEBHOOK_RUN_CONFIG: ExecutionConfig = {
  commands: [],
  agentProvider: "codex",
  agentModel: "gpt-5.4",
  agentReasoningEffort: "high",
  runtime: {
    target: "local",
    provider: "legacy_local",
    sandboxProfile: "none",
    idlePolicy: "retain",
  },
};

type SupportedGitHubEvent = "issues" | "issue_comment";

interface GitHubWebhookContext {
  action: "opened" | "created";
  deliveryId: string;
  installationId: number;
  issue: {
    body: string;
    htmlUrl: string;
    number: number;
    title: string;
  };
  comment?: {
    body: string;
    htmlUrl: string;
    id: number;
  };
  owner: string;
  repo: string;
  repository: {
    defaultBranch: string | null;
    fullName: string;
    htmlUrl: string | null;
  };
  senderLogin: string | null;
  sourceText: string;
  trigger: "issue_body" | "issue_comment";
}

function verifyGitHubWebhookSignature(input: {
  secret: string;
  payload: string;
  signature: string | null | undefined;
}) {
  if (!input.signature?.startsWith("sha256=")) {
    return false;
  }

  const received = Buffer.from(input.signature, "utf8");
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", input.secret).update(input.payload).digest("hex")}`,
    "utf8",
  );

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMentionPrompt(body: string, mentionLogins: string[]) {
  const trimmedBody = body.trim();

  if (!trimmedBody || mentionLogins.length === 0) {
    return null;
  }

  for (const login of mentionLogins) {
    const regex = new RegExp(`(^|\\s)@${escapeForRegex(login)}(?=$|\\s|[,:.!?])`, "i");

    if (!regex.test(trimmedBody)) {
      continue;
    }

    const cleaned = trimmedBody
      .replace(new RegExp(`@${escapeForRegex(login)}(?=$|\\s|[,:.!?])`, "gi"), "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      cleaned,
      mention: login,
    };
  }

  return null;
}

function buildTaskPrompt(context: GitHubWebhookContext, cleanedMentionText: string | null) {
  const promptParts = [
    `You were invoked from a GitHub ${context.trigger === "issue_comment" ? "issue comment" : "issue body"} mention.`,
    `Repository: ${context.owner}/${context.repo}`,
    `Issue: #${context.issue.number} ${context.issue.title}`,
  ];

  if (cleanedMentionText) {
    promptParts.push(`Requested work:\n${cleanedMentionText}`);
  }

  if (context.trigger === "issue_comment" && context.comment) {
    promptParts.push(`Mention comment URL: ${context.comment.htmlUrl}`);
  }

  promptParts.push(`Issue URL: ${context.issue.htmlUrl}`);
  promptParts.push(`Issue body:\n${context.issue.body.trim() || "(empty)"}`);

  return promptParts.join("\n\n");
}

function buildTaskTitle(context: GitHubWebhookContext) {
  return `${context.owner}/${context.repo}#${context.issue.number}: ${context.issue.title}`;
}

function deriveWebOrigin(input: { requestOrigin?: string | null }) {
  const explicitWebUrl = process.env.VITE_WEB_URL?.trim();

  if (explicitWebUrl) {
    return explicitWebUrl.replace(/\/+$/, "");
  }

  const setupUrl = apiEnv.GITHUB_APP_SETUP_URL?.trim();
  if (setupUrl) {
    try {
      return new URL(setupUrl).origin;
    } catch {
      return null;
    }
  }

  if (apiEnv.SERVE_FRONTEND && input.requestOrigin) {
    return input.requestOrigin.replace(/\/+$/, "");
  }

  return null;
}

function buildAckComment(taskUrl: string) {
  return [
    "👀 Agent Center picked this up.",
    "",
    `- Status: Started task`,
    `- Task: ${taskUrl}`,
    `- Draft PR: Not opened yet`,
  ].join("\n");
}

function withGitHubProgressMetadata(
  metadata: Record<string, unknown>,
  input: {
    progressComment?: { id: number; htmlUrl: string; taskUrl: string } | null;
    mentionReaction?: { id: number; commentId: number | null; target: "issue" | "issue_comment" } | null;
  },
) {
  const github = (metadata.github ?? {}) as Record<string, unknown>;

  return {
    ...metadata,
    github: {
      ...github,
      ...(input.progressComment ? { progressComment: input.progressComment } : {}),
      ...(input.mentionReaction ? { mentionReaction: input.mentionReaction } : {}),
    },
  };
}

function parseSupportedWebhook(input: { event: SupportedGitHubEvent; rawBody: string; deliveryId: string }) {
  const json = JSON.parse(input.rawBody) as unknown;

  if (input.event === "issues") {
    const payload = githubIssuesOpenedSchema.parse(json);

    return {
      action: payload.action,
      deliveryId: input.deliveryId,
      installationId: payload.installation.id,
      issue: {
        body: payload.issue.body ?? "",
        htmlUrl: payload.issue.html_url,
        number: payload.issue.number,
        title: payload.issue.title,
      },
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      repository: {
        defaultBranch: payload.repository.default_branch ?? null,
        fullName: payload.repository.full_name,
        htmlUrl: payload.repository.html_url ?? null,
      },
      senderLogin: payload.sender?.login ?? null,
      sourceText: payload.issue.body ?? "",
      trigger: "issue_body" as const,
      isPullRequestConversation: payload.issue.pull_request !== undefined,
    };
  }

  const payload = githubIssueCommentCreatedSchema.parse(json);

  return {
    action: payload.action,
    comment: {
      body: payload.comment.body,
      htmlUrl: payload.comment.html_url,
      id: payload.comment.id,
    },
    deliveryId: input.deliveryId,
    installationId: payload.installation.id,
    issue: {
      body: payload.issue.body ?? "",
      htmlUrl: payload.issue.html_url,
      number: payload.issue.number,
      title: payload.issue.title,
    },
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    repository: {
      defaultBranch: payload.repository.default_branch ?? null,
      fullName: payload.repository.full_name,
      htmlUrl: payload.repository.html_url ?? null,
    },
    senderLogin: payload.sender?.login ?? null,
    sourceText: payload.comment.body,
    trigger: "issue_comment" as const,
    isPullRequestConversation: payload.issue.pull_request !== undefined,
  };
}

export const githubWebhookService = {
  verifySignature: verifyGitHubWebhookSignature,

  async handleSignedDelivery(input: {
    deliveryId: string | null | undefined;
    event: string | null | undefined;
    rawBody: string;
    requestOrigin?: string | null;
    signature: string | null | undefined;
  }) {
    const secret = apiEnv.GITHUB_WEBHOOK_SECRET?.trim();

    if (!secret) {
      throw new ApiError(501, "github_webhook_not_configured", "GitHub webhook secret is not configured");
    }

    if (!input.deliveryId) {
      throw new ApiError(400, "github_delivery_id_missing", "GitHub delivery id header is required");
    }

    if (!verifyGitHubWebhookSignature({
      secret,
      payload: input.rawBody,
      signature: input.signature,
    })) {
      throw new ApiError(401, "github_webhook_signature_invalid", "GitHub webhook signature is invalid");
    }

    const existingTask = await findTaskByGitHubDeliveryId(input.deliveryId);
    if (existingTask) {
      return {
        deliveryId: input.deliveryId,
        status: "duplicate" as const,
        taskId: existingTask.id,
      };
    }

    if (input.event !== "issues" && input.event !== "issue_comment") {
      return {
        deliveryId: input.deliveryId,
        status: "ignored" as const,
        reason: "unsupported_event",
      };
    }

    let parsed;
    try {
      parsed = parseSupportedWebhook({
        event: input.event,
        rawBody: input.rawBody,
        deliveryId: input.deliveryId,
      });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        throw new ApiError(400, "github_webhook_payload_invalid", "GitHub webhook payload is invalid", {
          event: input.event,
        });
      }

      throw error;
    }

    if (parsed.isPullRequestConversation && input.event === "issue_comment") {
      return {
        deliveryId: input.deliveryId,
        status: "ignored" as const,
        reason: "pull_request_comment",
      };
    }

    const mention = extractMentionPrompt(parsed.sourceText, githubAppService.getWebhookMentionLogins());
    if (!mention) {
      return {
        deliveryId: input.deliveryId,
        status: "ignored" as const,
        reason: "no_bot_mention",
      };
    }

    const repoConnection = await findGitHubAppRepoConnectionByRepository({
      owner: parsed.owner,
      repo: parsed.repo,
      installationId: parsed.installationId,
    });

    if (!repoConnection) {
      return {
        deliveryId: input.deliveryId,
        status: "ignored" as const,
        reason: "repo_not_linked",
      };
    }

    const project =
      repoConnection.projectId != null
        ? await projectService.assertWithinWorkspace(repoConnection.workspaceId, repoConnection.projectId)
        : await projectService.findOrCreateRepositoryProject({
            workspaceId: repoConnection.workspaceId,
            owner: repoConnection.owner,
            repo: repoConnection.repo,
            defaultBranch: repoConnection.defaultBranch ?? parsed.repository.defaultBranch ?? "main",
          });

    const metadata = {
      github: {
        action: parsed.action,
        comment:
          parsed.comment === undefined
            ? null
            : {
                body: parsed.comment.body,
                htmlUrl: parsed.comment.htmlUrl,
                id: parsed.comment.id,
              },
        deliveryId: parsed.deliveryId,
        event: input.event,
        installationId: parsed.installationId,
        issue: {
          body: parsed.issue.body,
          htmlUrl: parsed.issue.htmlUrl,
          number: parsed.issue.number,
          title: parsed.issue.title,
        },
        mention: {
          login: mention.mention,
          prompt: mention.cleaned,
          trigger: parsed.trigger,
        },
        repository: {
          fullName: parsed.repository.fullName,
          htmlUrl: parsed.repository.htmlUrl,
          name: parsed.repo,
          owner: parsed.owner,
        },
        sender: parsed.senderLogin ? { login: parsed.senderLogin } : null,
        source: "github_webhook",
      },
    };

    const task = await taskService.create({
      workspaceId: repoConnection.workspaceId,
      projectId: project.id,
      repoConnectionId: repoConnection.id,
      automationId: null,
      title: buildTaskTitle(parsed),
      prompt: buildTaskPrompt(parsed, mention.cleaned || null),
      sandboxSize: "medium",
      permissionMode: "safe",
      baseBranch: repoConnection.defaultBranch ?? parsed.repository.defaultBranch ?? project.defaultBranch,
      branchName: null,
      policy: {},
      config: DEFAULT_WEBHOOK_RUN_CONFIG,
      metadata,
    });
    let nextMetadata: DomainMetadata = metadata;
    try {
      const reaction = await githubAppService.createMentionReaction({
        installationId: parsed.installationId,
        owner: parsed.owner,
        repo: parsed.repo,
        issueNumber: parsed.issue.number,
        commentId: parsed.comment?.id ?? null,
      });

      nextMetadata = withGitHubProgressMetadata(nextMetadata, {
        mentionReaction: {
          id: reaction.id,
          commentId: parsed.comment?.id ?? null,
          target: parsed.comment ? "issue_comment" : "issue",
        },
      });
    } catch (error) {
      console.warn("[github-webhook-service] failed to add mention reaction", {
        deliveryId: input.deliveryId,
        error,
      });
    }

    const webOrigin = deriveWebOrigin({
      requestOrigin: input.requestOrigin,
    });
    const taskUrl = webOrigin ? `${webOrigin}/tasks/${task.id}` : null;

    if (taskUrl) {
      try {
        const progressComment = await githubAppService.createIssueComment({
          installationId: parsed.installationId,
          owner: parsed.owner,
          repo: parsed.repo,
          issueNumber: parsed.issue.number,
          body: buildAckComment(taskUrl),
        });
        nextMetadata = withGitHubProgressMetadata(nextMetadata, {
          progressComment: {
            id: progressComment.id,
            htmlUrl: progressComment.htmlUrl,
            taskUrl,
          },
        });
      } catch (error) {
        console.warn("[github-webhook-service] failed to post acknowledgement comment", {
          deliveryId: input.deliveryId,
          error,
        });
      }
    }

    if (nextMetadata !== metadata) {
      await taskService.update(task.id, {
        metadata: nextMetadata,
      });
    }

    const run = await runService.create({
      taskId: task.id,
    });

    return {
      deliveryId: input.deliveryId,
      runId: run.id,
      status: "created" as const,
      taskId: task.id,
      taskUrl,
    };
  },
};
