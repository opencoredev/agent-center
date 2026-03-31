import type { RepoAuthType, RepoProvider } from "./index";

export interface GitProviderConnectionMetadata {
  [key: string]: unknown;
}

export interface GitProviderRepositoryRef {
  owner: string;
  repo: string;
}

export interface GitProviderAuthInput {
  authType?: RepoAuthType;
  token?: string | null;
  connectionMetadata?: GitProviderConnectionMetadata | null;
}

export interface GitProviderRequest extends GitProviderRepositoryRef, GitProviderAuthInput {
  baseUrl?: string;
  apiBaseUrl?: string;
  signal?: AbortSignal;
}

export interface GitRepository {
  id: string;
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  visibility: string | null;
  cloneUrl: string;
  htmlUrl: string;
}

export interface GitRepositoryAccessResult {
  ok: boolean;
  status: number | null;
  repository: GitRepository | null;
  error: string | null;
}

export interface GitCloneUrlValue {
  readonly redactedUrl: string;
  readonly usesAuthentication: boolean;
  toJSON(): string;
  toString(): string;
  unwrap(): string;
}

export interface GitCloneUrlInput extends GitProviderRequest {
  protocol?: "https";
}

export interface GitBranchPushMetadata {
  remoteName: string;
  branchName: string;
  remoteRef: string;
  refspec: string;
  setUpstreamArgs: readonly ["--set-upstream", string, string];
}

export interface GitBranchPushMetadataInput {
  branchName: string;
  remoteName?: string;
}

export interface GitCreatePullRequestInput extends GitProviderRequest {
  title: string;
  body?: string | null;
  head: string;
  base: string;
  draft?: boolean;
  maintainerCanModify?: boolean;
}

export interface GitPullRequest {
  id: string;
  number: number;
  state: string;
  title: string;
  body: string | null;
  url: string;
  htmlUrl: string;
  draft: boolean;
  head: string;
  base: string;
}

export interface GitProvider {
  readonly provider: RepoProvider;
  testRepositoryAccess(input: GitProviderRequest): Promise<GitRepositoryAccessResult>;
  getRepository(input: GitProviderRequest): Promise<GitRepository>;
  buildCloneUrl(input: GitCloneUrlInput): GitCloneUrlValue;
  buildBranchPushMetadata(input: GitBranchPushMetadataInput): GitBranchPushMetadata;
  createPullRequest(input: GitCreatePullRequestInput): Promise<GitPullRequest>;
}
