export type {
  GitBranchPushMetadata,
  GitBranchPushMetadataInput,
  GitCloneUrlInput,
  GitCloneUrlValue,
  GitCreatePullRequestInput,
  GitProvider,
  GitProviderAuthInput,
  GitProviderConnectionMetadata,
  GitProviderRequest,
  GitProviderRepositoryRef,
  GitPullRequest,
  GitRepository,
  GitRepositoryAccessResult,
  RepoAuthType,
  RepoProvider,
} from "../../shared/src/index.ts";

export {
  GitHubApiError,
  GitHubAuthenticationError,
  GitHubCloneUrl,
  GitHubProvider,
  GitHubProviderError,
  createGitHubProvider,
} from "./provider";
export {
  GitHubAppApiError,
  GitHubAppClient,
  GitHubAppConfigurationError,
  buildGitHubAppInstallUrl,
} from "./app-client";

export type {
  GitHubConnectionMetadata,
  GitHubProviderOptions,
  GitHubTokenResolutionContext,
} from "./provider";
export type {
  GitHubAppClientOptions,
  GitHubAppInstallation,
  GitHubIssueCommentSummary,
  GitHubReactionSummary,
  GitHubAppSummary,
  GitHubInstallationRepository,
  GitHubInstallationRepositoryPage,
  GitHubUserSummary,
} from "./app-client";
