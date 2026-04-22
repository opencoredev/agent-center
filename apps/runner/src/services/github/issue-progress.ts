import { GitHubAppClient, GitHubAppConfigurationError, GitHubAppApiError } from "@agent-center/github";

import type { DomainMetadata } from "@agent-center/shared";

interface MentionReactionMetadata {
  id: number;
  commentId: number | null;
  target: "issue" | "issue_comment";
}

interface ProgressCommentMetadata {
  id: number;
  htmlUrl: string | null;
  taskUrl: string | null;
}

interface IssueOrigin {
  installationId: number;
  issueNumber: number;
  owner: string;
  repo: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function getIssueOrigin(metadata: DomainMetadata | null | undefined): IssueOrigin | null {
  const github = asRecord(asRecord(metadata)?.github);
  const repository = asRecord(github?.repository);
  const issue = asRecord(github?.issue);
  const installationId = asPositiveInteger(github?.installationId);
  const issueNumber = asPositiveInteger(issue?.number);
  const owner = asString(repository?.owner);
  const repo = asString(repository?.name);

  if (!installationId || !issueNumber || !owner || !repo) {
    return null;
  }

  return {
    installationId,
    issueNumber,
    owner,
    repo,
  };
}

function getMentionReaction(metadata: DomainMetadata | null | undefined): MentionReactionMetadata | null {
  const github = asRecord(asRecord(metadata)?.github);
  const reaction = asRecord(github?.mentionReaction);
  const id = asPositiveInteger(reaction?.id);
  const rawTarget = asString(reaction?.target);

  if (!id || (rawTarget !== "issue" && rawTarget !== "issue_comment")) {
    return null;
  }

  return {
    id,
    commentId: asPositiveInteger(reaction?.commentId),
    target: rawTarget,
  };
}

function getProgressComment(metadata: DomainMetadata | null | undefined): ProgressCommentMetadata | null {
  const github = asRecord(asRecord(metadata)?.github);
  const progressComment = asRecord(github?.progressComment);
  const id = asPositiveInteger(progressComment?.id);

  if (!id) {
    return null;
  }

  return {
    id,
    htmlUrl: asString(progressComment?.htmlUrl),
    taskUrl: asString(progressComment?.taskUrl),
  };
}

function buildCompletedProgressComment(taskUrl: string | null) {
  return [
    "👍 Agent Center finished this task.",
    "",
    "- Status: Task completed",
    taskUrl ? `- Task: ${taskUrl}` : null,
    "- Draft PR: Not opened yet",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function createGitHubAppClient() {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();

  if (!appId || !slug || !privateKey) {
    return null;
  }

  return new GitHubAppClient({
    appId,
    slug,
    privateKey,
  });
}

export async function markGitHubIssueHandled(metadata: DomainMetadata | null | undefined) {
  const issueOrigin = getIssueOrigin(metadata);
  const mentionReaction = getMentionReaction(metadata);
  const progressComment = getProgressComment(metadata);

  if (!issueOrigin || !mentionReaction) {
    return;
  }

  const client = createGitHubAppClient();
  if (!client) {
    return;
  }

  try {
    const token = await client.createInstallationAccessToken(issueOrigin.installationId);

    if (mentionReaction.target === "issue_comment" && mentionReaction.commentId) {
      await client.deleteIssueCommentReaction({
        owner: issueOrigin.owner,
        repo: issueOrigin.repo,
        commentId: mentionReaction.commentId,
        reactionId: mentionReaction.id,
        token: token.token,
      });

      await client.createIssueCommentReaction({
        owner: issueOrigin.owner,
        repo: issueOrigin.repo,
        commentId: mentionReaction.commentId,
        content: "+1",
        token: token.token,
      });
    } else {
      await client.deleteIssueReaction({
        owner: issueOrigin.owner,
        repo: issueOrigin.repo,
        issueNumber: issueOrigin.issueNumber,
        reactionId: mentionReaction.id,
        token: token.token,
      });

      await client.createIssueReaction({
        owner: issueOrigin.owner,
        repo: issueOrigin.repo,
        issueNumber: issueOrigin.issueNumber,
        content: "+1",
        token: token.token,
      });
    }

    if (progressComment) {
      await client.updateIssueComment({
        owner: issueOrigin.owner,
        repo: issueOrigin.repo,
        commentId: progressComment.id,
        body: buildCompletedProgressComment(progressComment.taskUrl),
        token: token.token,
      });
    }
  } catch (error) {
    if (error instanceof GitHubAppConfigurationError || error instanceof GitHubAppApiError) {
      console.warn("[runner] failed to update GitHub mention reaction", {
        error: error.message,
        issueNumber: issueOrigin.issueNumber,
        owner: issueOrigin.owner,
        repo: issueOrigin.repo,
      });
      return;
    }

    throw error;
  }
}
