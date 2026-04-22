import { readFileSync } from "node:fs";
import { createPrivateKey, createSign } from "node:crypto";

const DEFAULT_BASE_URL = "https://github.com";
const DEFAULT_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export interface GitHubAppClientOptions {
  appId: string;
  slug: string;
  privateKey: string;
  baseUrl?: string;
  apiBaseUrl?: string;
  userAgent?: string;
  fetch?: typeof fetch;
}

export interface GitHubAppSummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  externalUrl: string | null;
  htmlUrl: string;
  ownerLogin: string | null;
}

export interface GitHubUserSummary {
  id: number;
  login: string;
  type: string;
  htmlUrl: string;
  avatarUrl: string | null;
}

export interface GitHubAppInstallation {
  id: number;
  accountLogin: string;
  accountType: string;
  targetType: string;
  repositorySelection: string;
  htmlUrl: string | null;
  appId: number;
}

export interface GitHubInstallationRepository {
  id: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string;
  private: boolean;
  visibility: string | null;
  htmlUrl: string;
  permissions: Record<string, boolean>;
}

export interface GitHubInstallationRepositoryPage {
  totalCount: number;
  repositories: GitHubInstallationRepository[];
}

export interface GitHubIssueCommentSummary {
  id: number;
  body: string;
  htmlUrl: string;
}

export interface GitHubReactionSummary {
  id: number;
  content: string;
}

interface GitHubAppResponse {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  external_url: string | null;
  html_url: string;
  owner: {
    login: string;
  } | null;
}

interface GitHubAppInstallationResponse {
  id: number;
  target_type: string;
  repository_selection: string;
  html_url: string | null;
  app_id: number;
  account: {
    login: string;
    type: string;
  };
}

interface GitHubInstallationAccessTokenResponse {
  token: string;
  expires_at?: string;
}

interface GitHubInstallationRepositoriesResponse {
  total_count: number;
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    default_branch: string;
    private: boolean;
    visibility?: string | null;
    html_url: string;
    permissions?: Record<string, boolean>;
    owner: {
      login: string;
    };
  }>;
}

interface GitHubUserResponse {
  id: number;
  login: string;
  type: string;
  html_url: string;
  avatar_url?: string | null;
}

interface GitHubIssueCommentResponse {
  id: number;
  body: string;
  html_url: string;
}

interface GitHubReactionResponse {
  id: number;
  content: string;
}

interface GitHubErrorBody {
  message?: string;
}

export class GitHubAppConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubAppConfigurationError";
  }
}

export class GitHubAppApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubAppApiError";
    this.status = status;
  }
}

export class GitHubAppClient {
  #appId: string;
  #slug: string;
  #privateKey: string;
  #baseUrl: string;
  #apiBaseUrl: string;
  #userAgent: string;
  #fetch: typeof fetch;

  constructor(options: GitHubAppClientOptions) {
    this.#appId = normalizeRequiredValue(options.appId, "GitHub App ID");
    this.#slug = normalizeRequiredValue(options.slug, "GitHub App slug");
    this.#privateKey = resolvePrivateKey(options.privateKey);
    this.#baseUrl = normalizeUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#apiBaseUrl = normalizeUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
    this.#userAgent = options.userAgent ?? "@agent-center/github-app";
    this.#fetch = options.fetch ?? fetch;
  }

  getInstallUrl(input: { state?: string } = {}) {
    return buildGitHubAppInstallUrl({
      slug: this.#slug,
      baseUrl: this.#baseUrl,
      state: input.state,
    });
  }

  async getApp(): Promise<GitHubAppSummary> {
    const response = await this.#requestJson<GitHubAppResponse>({
      path: "/app",
      auth: { type: "app" },
    });

    return mapApp(response);
  }

  async listInstallations(): Promise<GitHubAppInstallation[]> {
    const response = await this.#requestJson<GitHubAppInstallationResponse[]>({
      path: "/app/installations",
      auth: { type: "app" },
    });

    return response.map(mapInstallation);
  }

  async listInstallationRepositories(
    installationId: number,
  ): Promise<GitHubInstallationRepositoryPage> {
    const installationToken = await this.createInstallationAccessToken(installationId);
    const repositories: GitHubInstallationRepository[] = [];
    let totalCount = 0;
    let page = 1;

    while (true) {
      const response = await this.#requestJson<GitHubInstallationRepositoriesResponse>({
        path: `/installation/repositories?per_page=100&page=${page}`,
        auth: {
          type: "installation",
          token: installationToken.token,
        },
      });

      totalCount = response.total_count;
      repositories.push(...response.repositories.map(mapInstallationRepository));

      if (repositories.length >= totalCount || response.repositories.length < 100) {
        break;
      }

      page += 1;
    }

    return {
      totalCount,
      repositories,
    };
  }

  async createInstallationAccessToken(installationId: number) {
    return this.#requestJson<GitHubInstallationAccessTokenResponse>({
      path: `/app/installations/${installationId}/access_tokens`,
      method: "POST",
      auth: { type: "app" },
      body: JSON.stringify({}),
    });
  }

  async getUser(username: string, token: string): Promise<GitHubUserSummary> {
    const response = await this.#requestJson<GitHubUserResponse>({
      path: `/users/${encodeURIComponent(normalizeRequiredValue(username, "GitHub username"))}`,
      auth: {
        type: "installation",
        token,
      },
    });

    return mapUser(response);
  }

  async createIssueComment(input: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
    token: string;
  }): Promise<GitHubIssueCommentSummary> {
    const response = await this.#requestJson<GitHubIssueCommentResponse>({
      path: `/repos/${encodeURIComponent(normalizeRequiredValue(input.owner, "repository owner"))}/${encodeURIComponent(normalizeRequiredValue(input.repo, "repository name"))}/issues/${input.issueNumber}/comments`,
      method: "POST",
      auth: {
        type: "installation",
        token: normalizeRequiredValue(input.token, "installation token"),
      },
      body: JSON.stringify({
        body: normalizeRequiredValue(input.body, "issue comment body"),
      }),
    });

    return mapIssueComment(response);
  }

  async updateIssueComment(input: {
    owner: string;
    repo: string;
    commentId: number;
    body: string;
    token: string;
  }): Promise<GitHubIssueCommentSummary> {
    const response = await this.#requestJson<GitHubIssueCommentResponse>({
      path: `/repos/${encodeURIComponent(normalizeRequiredValue(input.owner, "repository owner"))}/${encodeURIComponent(normalizeRequiredValue(input.repo, "repository name"))}/issues/comments/${input.commentId}`,
      method: "PATCH",
      auth: {
        type: "installation",
        token: normalizeRequiredValue(input.token, "installation token"),
      },
      body: JSON.stringify({
        body: normalizeRequiredValue(input.body, "issue comment body"),
      }),
    });

    return mapIssueComment(response);
  }

  async createIssueReaction(input: {
    owner: string;
    repo: string;
    issueNumber: number;
    content: string;
    token: string;
  }): Promise<GitHubReactionSummary> {
    const response = await this.#requestJson<GitHubReactionResponse>({
      path: `/repos/${encodeURIComponent(normalizeRequiredValue(input.owner, "repository owner"))}/${encodeURIComponent(normalizeRequiredValue(input.repo, "repository name"))}/issues/${input.issueNumber}/reactions`,
      method: "POST",
      auth: {
        type: "installation",
        token: normalizeRequiredValue(input.token, "installation token"),
      },
      body: JSON.stringify({
        content: normalizeRequiredValue(input.content, "reaction content"),
      }),
    });

    return mapReaction(response);
  }

  async createIssueCommentReaction(input: {
    owner: string;
    repo: string;
    commentId: number;
    content: string;
    token: string;
  }): Promise<GitHubReactionSummary> {
    const response = await this.#requestJson<GitHubReactionResponse>({
      path: `/repos/${encodeURIComponent(normalizeRequiredValue(input.owner, "repository owner"))}/${encodeURIComponent(normalizeRequiredValue(input.repo, "repository name"))}/issues/comments/${input.commentId}/reactions`,
      method: "POST",
      auth: {
        type: "installation",
        token: normalizeRequiredValue(input.token, "installation token"),
      },
      body: JSON.stringify({
        content: normalizeRequiredValue(input.content, "reaction content"),
      }),
    });

    return mapReaction(response);
  }

  async deleteIssueReaction(input: {
    owner: string;
    repo: string;
    issueNumber: number;
    reactionId: number;
    token: string;
  }): Promise<void> {
    await this.#requestJson<void>({
      path: `/repos/${encodeURIComponent(normalizeRequiredValue(input.owner, "repository owner"))}/${encodeURIComponent(normalizeRequiredValue(input.repo, "repository name"))}/issues/${input.issueNumber}/reactions/${input.reactionId}`,
      method: "DELETE",
      auth: {
        type: "installation",
        token: normalizeRequiredValue(input.token, "installation token"),
      },
    });
  }

  async deleteIssueCommentReaction(input: {
    owner: string;
    repo: string;
    commentId: number;
    reactionId: number;
    token: string;
  }): Promise<void> {
    await this.#requestJson<void>({
      path: `/repos/${encodeURIComponent(normalizeRequiredValue(input.owner, "repository owner"))}/${encodeURIComponent(normalizeRequiredValue(input.repo, "repository name"))}/issues/comments/${input.commentId}/reactions/${input.reactionId}`,
      method: "DELETE",
      auth: {
        type: "installation",
        token: normalizeRequiredValue(input.token, "installation token"),
      },
    });
  }

  async #requestJson<T>(input: {
    path: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    auth: { type: "app" } | { type: "installation"; token: string };
    body?: string;
  }): Promise<T> {
    const token =
      input.auth.type === "app"
        ? this.#createAppJwt()
        : normalizeRequiredValue(input.auth.token, "installation token");

    const response = await this.#fetch(`${this.#apiBaseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers: buildHeaders({
        token,
        userAgent: this.#userAgent,
        hasBody: input.body !== undefined,
      }),
      body: input.body,
    });

    const payload = await parseJsonBody<T | GitHubErrorBody>(response);

    if (!response.ok) {
      throw new GitHubAppApiError(
        buildErrorMessage(payload as GitHubErrorBody | null, response.status),
        response.status,
      );
    }

    return payload as T;
  }

  #createAppJwt() {
    const issuedAt = Math.floor(Date.now() / 1000) - 60;
    const expiresAt = issuedAt + 9 * 60;
    const header = base64UrlEncode(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
      }),
    );
    const payload = base64UrlEncode(
      JSON.stringify({
        iat: issuedAt,
        exp: expiresAt,
        iss: this.#appId,
      }),
    );
    const unsignedToken = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(createPrivateKey(this.#privateKey)).toString("base64url");

    return `${unsignedToken}.${signature}`;
  }
}

export function buildGitHubAppInstallUrl(input: {
  slug: string;
  baseUrl?: string;
  state?: string;
}) {
  const url = new URL(
    `/apps/${encodeURIComponent(input.slug)}/installations/new`,
    `${normalizeUrl(input.baseUrl ?? DEFAULT_BASE_URL)}/`,
  );

  if (input.state) {
    url.searchParams.set("state", input.state);
  }

  return url.toString();
}

function buildHeaders(input: {
  token: string;
  userAgent: string;
  hasBody: boolean;
}) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${input.token}`,
    "User-Agent": input.userAgent,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };

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

function buildErrorMessage(payload: GitHubErrorBody | null, status: number) {
  const message = payload?.message?.trim();
  if (message) {
    return `GitHub App API request failed (${status}): ${message}`;
  }

  return `GitHub App API request failed with status ${status}`;
}

function mapApp(app: GitHubAppResponse): GitHubAppSummary {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    externalUrl: app.external_url,
    htmlUrl: app.html_url,
    ownerLogin: app.owner?.login ?? null,
  };
}

function mapInstallation(installation: GitHubAppInstallationResponse): GitHubAppInstallation {
  return {
    id: installation.id,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    targetType: installation.target_type,
    repositorySelection: installation.repository_selection,
    htmlUrl: installation.html_url,
    appId: installation.app_id,
  };
}

function mapInstallationRepository(
  repository: GitHubInstallationRepositoriesResponse["repositories"][number],
): GitHubInstallationRepository {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    ownerLogin: repository.owner.login,
    defaultBranch: repository.default_branch,
    private: repository.private,
    visibility: repository.visibility ?? null,
    htmlUrl: repository.html_url,
    permissions: repository.permissions ?? {},
  };
}

function mapUser(user: GitHubUserResponse): GitHubUserSummary {
  return {
    id: user.id,
    login: user.login,
    type: user.type,
    htmlUrl: user.html_url,
    avatarUrl: user.avatar_url ?? null,
  };
}

function mapIssueComment(comment: GitHubIssueCommentResponse): GitHubIssueCommentSummary {
  return {
    id: comment.id,
    body: comment.body,
    htmlUrl: comment.html_url,
  };
}

function mapReaction(reaction: GitHubReactionResponse): GitHubReactionSummary {
  return {
    id: reaction.id,
    content: reaction.content,
  };
}

function resolvePrivateKey(privateKey: string) {
  const normalized = normalizeRequiredValue(privateKey, "GitHub App private key");

  if (normalized.includes("BEGIN")) {
    return normalized;
  }

  return readFileSync(normalized, "utf8");
}

function normalizeRequiredValue(value: string | null | undefined, label: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new GitHubAppConfigurationError(`${label} is required`);
  }

  return normalized;
}

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}
