import type {
  GitBranchPushMetadata,
  GitBranchPushMetadataInput,
  GitCloneUrlInput,
  GitCloneUrlValue,
  GitCreatePullRequestInput,
  GitProvider,
  GitProviderConnectionMetadata,
  GitProviderRequest,
  GitPullRequest,
  GitRepository,
  GitRepositoryAccessResult,
} from "../../shared/src/index.ts";

const DEFAULT_BASE_URL = "https://github.com";
const DEFAULT_API_BASE_URL = "https://api.github.com";
const DEFAULT_ENV_TOKEN_NAMES = ["GITHUB_TOKEN", "GITHUB_PAT", "GH_TOKEN"] as const;
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_PROVIDER = "github" as const;

interface GitHubRepositoryResponse {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  visibility?: string | null;
  clone_url: string;
  html_url: string;
  owner: {
    login: string;
  };
}

interface GitHubPullRequestResponse {
  id: number;
  number: number;
  state: string;
  title: string;
  body: string | null;
  html_url: string;
  url: string;
  draft: boolean;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

export interface GitHubConnectionMetadata extends GitProviderConnectionMetadata {
  token?: string;
  accessToken?: string;
  pat?: string;
  personalAccessToken?: string;
  baseUrl?: string;
  apiBaseUrl?: string;
}

export interface GitHubTokenResolutionContext {
  owner: string;
  repo: string;
  connectionMetadata: GitHubConnectionMetadata | null;
}

export interface GitHubProviderOptions {
  token?: string;
  baseUrl?: string;
  apiBaseUrl?: string;
  envTokenNames?: readonly string[];
  userAgent?: string;
  fetch?: typeof fetch;
  getEnvToken?: (context: GitHubTokenResolutionContext) => string | null | undefined;
}

interface ResolvedRepositoryRequest {
  owner: string;
  repo: string;
  baseUrl: string;
  apiBaseUrl: string;
  token: string | null;
  signal?: AbortSignal;
}

interface GitHubRequestOptions extends ResolvedRepositoryRequest {
  method?: "GET" | "POST";
  body?: string;
  path?: string;
}

interface GitHubJsonResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export class GitHubProviderError extends Error {
  readonly status: number | null;

  constructor(message: string, status?: number | null) {
    super(message);
    this.name = "GitHubProviderError";
    this.status = status ?? null;
  }
}

export class GitHubAuthenticationError extends GitHubProviderError {
  constructor(message = "GitHub token is required for this operation") {
    super(message, 401);
    this.name = "GitHubAuthenticationError";
  }
}

export class GitHubApiError extends GitHubProviderError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "GitHubApiError";
  }
}

export class GitHubCloneUrl implements GitCloneUrlValue {
  readonly redactedUrl: string;
  readonly usesAuthentication: boolean;
  #url: string;

  constructor(url: string, redactedUrl: string, usesAuthentication: boolean) {
    this.#url = url;
    this.redactedUrl = redactedUrl;
    this.usesAuthentication = usesAuthentication;
  }

  toJSON(): string {
    return this.redactedUrl;
  }

  toString(): string {
    return this.redactedUrl;
  }

  unwrap(): string {
    return this.#url;
  }
}

export class GitHubProvider implements GitProvider {
  readonly provider = GITHUB_PROVIDER;
  #token: string | null;
  #baseUrl: string;
  #apiBaseUrl: string;
  #envTokenNames: readonly string[];
  #userAgent: string;
  #fetch: typeof fetch;
  #getEnvToken?: GitHubProviderOptions["getEnvToken"];

  constructor(options: GitHubProviderOptions = {}) {
    this.#token = normalizeToken(options.token);
    this.#baseUrl = resolveBaseUrl(options.baseUrl);
    this.#apiBaseUrl = resolveApiBaseUrl({
      apiBaseUrl: options.apiBaseUrl,
      baseUrl: this.#baseUrl,
    });
    this.#envTokenNames = options.envTokenNames ?? DEFAULT_ENV_TOKEN_NAMES;
    this.#userAgent = options.userAgent ?? "@agent-center/github";
    this.#fetch = options.fetch ?? fetch;
    this.#getEnvToken = options.getEnvToken;
  }

  async testRepositoryAccess(input: GitProviderRequest): Promise<GitRepositoryAccessResult> {
    const request = this.#resolveRequest(input);
    const response = await this.#requestJson<GitHubRepositoryResponse>({
      ...request,
      method: "GET",
      path: "",
    });

    if (!response.ok || !response.data) {
      return {
        ok: false,
        status: response.status,
        repository: null,
        error: response.error ?? "Unable to access repository",
      };
    }

    return {
      ok: true,
      status: response.status,
      repository: mapRepository(response.data),
      error: null,
    };
  }

  async getRepository(input: GitProviderRequest): Promise<GitRepository> {
    const request = this.#resolveRequest(input);
    const response = await this.#requestJson<GitHubRepositoryResponse>({
      ...request,
      method: "GET",
      path: "",
    });

    if (!response.ok || !response.data) {
      throw new GitHubApiError(response.error ?? "Unable to fetch repository", response.status);
    }

    return mapRepository(response.data);
  }

  buildCloneUrl(input: GitCloneUrlInput): GitHubCloneUrl {
    const request = this.#resolveRequest(input);
    const repoPath = buildRepositoryPath(request.owner, request.repo);
    const repositoryUrl = new URL(`${repoPath}.git`, `${request.baseUrl}/`);

    if (!request.token) {
      const publicUrl = repositoryUrl.toString();
      return new GitHubCloneUrl(publicUrl, publicUrl, false);
    }

    repositoryUrl.username = "x-access-token";
    repositoryUrl.password = request.token;

    const redactedUrl = `${repositoryUrl.protocol}//x-access-token:[REDACTED]@${repositoryUrl.host}${repositoryUrl.pathname}`;

    return new GitHubCloneUrl(repositoryUrl.toString(), redactedUrl, true);
  }

  buildBranchPushMetadata(input: GitBranchPushMetadataInput): GitBranchPushMetadata {
    const remoteName = input.remoteName ?? "origin";
    const remoteRef = `refs/heads/${input.branchName}`;

    return {
      remoteName,
      branchName: input.branchName,
      remoteRef,
      refspec: `HEAD:${remoteRef}`,
      setUpstreamArgs: ["--set-upstream", remoteName, input.branchName],
    };
  }

  async createPullRequest(input: GitCreatePullRequestInput): Promise<GitPullRequest> {
    const request = this.#resolveRequest(input, {
      requireToken: true,
    });
    const response = await this.#requestJson<GitHubPullRequestResponse>({
      ...request,
      method: "POST",
      path: "/pulls",
      body: JSON.stringify({
        title: input.title,
        body: input.body ?? undefined,
        head: input.head,
        base: input.base,
        draft: input.draft ?? false,
        maintainer_can_modify: input.maintainerCanModify ?? true,
      }),
    });

    if (!response.ok || !response.data) {
      throw new GitHubApiError(response.error ?? "Unable to create pull request", response.status);
    }

    return mapPullRequest(response.data);
  }

  #resolveRequest(
    input: GitProviderRequest,
    options: {
      requireToken?: boolean;
    } = {},
  ): ResolvedRepositoryRequest {
    const connectionMetadata = asGitHubConnectionMetadata(input.connectionMetadata);
    const baseUrl = resolveBaseUrl(input.baseUrl ?? connectionMetadata?.baseUrl ?? this.#baseUrl);
    const apiBaseUrl = resolveApiBaseUrl({
      apiBaseUrl: input.apiBaseUrl ?? connectionMetadata?.apiBaseUrl ?? this.#apiBaseUrl,
      baseUrl,
    });
    const token = this.#resolveToken({
      owner: input.owner,
      repo: input.repo,
      connectionMetadata,
      token: input.token,
    });

    if (options.requireToken && !token) {
      throw new GitHubAuthenticationError();
    }

    return {
      owner: input.owner,
      repo: input.repo,
      baseUrl,
      apiBaseUrl,
      token,
      signal: input.signal,
    };
  }

  #resolveToken(input: {
    owner: string;
    repo: string;
    connectionMetadata: GitHubConnectionMetadata | null;
    token?: string | null;
  }): string | null {
    const directToken = normalizeToken(input.token);
    if (directToken) {
      return directToken;
    }

    const metadataToken = extractTokenFromMetadata(input.connectionMetadata);
    if (metadataToken) {
      return metadataToken;
    }

    if (this.#token) {
      return this.#token;
    }

    const helperToken = normalizeToken(
      this.#getEnvToken?.({
        owner: input.owner,
        repo: input.repo,
        connectionMetadata: input.connectionMetadata,
      }),
    );
    if (helperToken) {
      return helperToken;
    }

    for (const envName of this.#envTokenNames) {
      const envToken = normalizeToken(process.env[envName]);
      if (envToken) {
        return envToken;
      }
    }

    return null;
  }

  async #requestJson<T>(options: GitHubRequestOptions): Promise<GitHubJsonResponse<T>> {
    const response = await this.#fetch(
      `${options.apiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}${options.path ?? ""}`,
      {
        method: options.method ?? "GET",
        headers: buildHeaders({
          token: options.token,
          userAgent: this.#userAgent,
          hasBody: options.body !== undefined,
        }),
        body: options.body,
        signal: options.signal,
      },
    );

    const data = await parseJsonBody<
      GitHubRepositoryResponse | GitHubPullRequestResponse | GitHubErrorBody
    >(response);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: buildGitHubErrorMessage(data, response.status),
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data as T,
      error: null,
    };
  }
}

interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
}

export function createGitHubProvider(options: GitHubProviderOptions = {}): GitHubProvider {
  return new GitHubProvider(options);
}

function mapRepository(input: GitHubRepositoryResponse): GitRepository {
  return {
    id: String(input.id),
    owner: input.owner.login,
    repo: input.name,
    fullName: input.full_name,
    defaultBranch: input.default_branch,
    isPrivate: input.private,
    visibility: input.visibility ?? null,
    cloneUrl: input.clone_url,
    htmlUrl: input.html_url,
  };
}

function mapPullRequest(input: GitHubPullRequestResponse): GitPullRequest {
  return {
    id: String(input.id),
    number: input.number,
    state: input.state,
    title: input.title,
    body: input.body,
    url: input.url,
    htmlUrl: input.html_url,
    draft: input.draft,
    head: input.head.ref,
    base: input.base.ref,
  };
}

function buildHeaders(input: {
  token: string | null;
  userAgent: string;
  hasBody: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": input.userAgent,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };

  if (input.token) {
    headers.Authorization = `Bearer ${input.token}`;
  }

  if (input.hasBody) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function parseJsonBody<T>(response: Response): Promise<T | null> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return (await response.json()) as T;
}

function buildGitHubErrorMessage(
  body: GitHubErrorBody | GitHubRepositoryResponse | GitHubPullRequestResponse | null,
  status: number,
): string {
  if (
    body &&
    "message" in body &&
    typeof body.message === "string" &&
    body.message.trim().length > 0
  ) {
    return `GitHub API request failed (${status}): ${body.message.trim()}`;
  }

  return `GitHub API request failed with status ${status}`;
}

function normalizeToken(token: string | null | undefined): string | null {
  const normalized = token?.trim();
  return normalized ? normalized : null;
}

function asGitHubConnectionMetadata(
  metadata: GitProviderConnectionMetadata | null | undefined,
): GitHubConnectionMetadata | null {
  return metadata ? (metadata as GitHubConnectionMetadata) : null;
}

function extractTokenFromMetadata(metadata: GitHubConnectionMetadata | null): string | null {
  if (!metadata) {
    return null;
  }

  const possibleTokens = [
    metadata.token,
    metadata.accessToken,
    metadata.pat,
    metadata.personalAccessToken,
  ];

  for (const token of possibleTokens) {
    const normalized = normalizeToken(token);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function resolveBaseUrl(baseUrl: string | undefined): string {
  const normalized = normalizeUrl(baseUrl ?? DEFAULT_BASE_URL);
  return normalized;
}

function resolveApiBaseUrl(input: { apiBaseUrl?: string; baseUrl: string }): string {
  if (input.apiBaseUrl) {
    return normalizeUrl(input.apiBaseUrl);
  }

  if (input.baseUrl === DEFAULT_BASE_URL) {
    return DEFAULT_API_BASE_URL;
  }

  return `${input.baseUrl}/api/v3`;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildRepositoryPath(owner: string, repo: string): string {
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
