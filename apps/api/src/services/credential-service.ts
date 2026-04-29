import type { CredentialStatus, ResolvedCredential } from "@agent-center/shared";
import { decrypt, encrypt } from "@agent-center/shared";
import { api } from "@agent-center/control-plane/api";

import { ApiError } from "../http/errors";
import { apiEnv } from "../env";
import { asConvexId } from "../repositories/convex-repository-utils";
import { convexServiceClient } from "./convex-service-client";

type Provider = "claude" | "openai";
type OpenAICredentialMetadata = {
  encryptedIdToken?: unknown;
  idToken?: unknown;
};

function getEncryptionKey(): string {
  const key = apiEnv.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new ApiError(500, "encryption_not_configured", "CREDENTIAL_ENCRYPTION_KEY is not set");
  }
  return key;
}

// ── Generic helpers (shared by all providers) ───────────────────────────────

async function getCredentials(provider: Provider, userId: string): Promise<CredentialStatus> {
  const row = await convexServiceClient.query(api.serviceApi.getCredential, {
    provider,
    userId,
  });

  if (!row) {
    return {
      connected: false,
      source: null,
      email: null,
      expiresAt: null,
      subscriptionType: null,
    };
  }

  return {
    connected: true,
    source: row.source as "api_key" | "oauth",
    email: row.profileEmail ?? null,
    expiresAt: row.tokenExpiresAt ? new Date(row.tokenExpiresAt).toISOString() : null,
    subscriptionType: row.subscriptionType ?? null,
  };
}

async function storeProviderApiKey(
  provider: Provider,
  apiKey: string,
  userId: string,
): Promise<void> {
  const key = getEncryptionKey();
  const encryptedApiKey = encrypt(apiKey, key);

  await convexServiceClient.mutation(api.serviceApi.upsertCredential, {
    provider,
    userId,
    source: "api_key" as const,
    encryptedApiKey,
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
  });
}

async function resolveProviderCredential(
  provider: Provider,
  envFallbackKey: string,
  errorCode: string,
  errorMessage: string,
  userId: string,
): Promise<ResolvedCredential> {
  const row = await convexServiceClient.query(api.serviceApi.getCredential, {
    provider,
    userId,
  });

  if (row?.source === "api_key" && row.encryptedApiKey) {
    const key = getEncryptionKey();
    return {
      type: "api_key",
      value: decrypt(row.encryptedApiKey, key),
    };
  }

  const envApiKey = process.env[envFallbackKey];
  if (envApiKey) {
    return { type: "api_key", value: envApiKey };
  }

  throw new ApiError(422, errorCode, errorMessage);
}

async function deleteProviderCredentials(provider: Provider, userId: string): Promise<void> {
  await convexServiceClient.mutation(api.serviceApi.deleteCredential, {
    provider,
    userId,
  });
}

// ── Claude ──────────────────────────────────────────────────────────────────

async function getClaudeCredentials(userId: string): Promise<CredentialStatus> {
  return getCredentials("claude", userId);
}

async function storeClaudeApiKey(apiKey: string, userId: string): Promise<void> {
  return storeProviderApiKey("claude", apiKey, userId);
}

async function updateClaudeProfile(
  email: string | null,
  subscriptionType: string | null,
  userId: string,
): Promise<void> {
  await convexServiceClient.mutation(api.serviceApi.patchCredentialProfile, {
    provider: "claude",
    userId,
    profileEmail: email,
    subscriptionType,
  });
}

async function resolveClaudeCredential(userId: string): Promise<ResolvedCredential> {
  return resolveProviderCredential(
    "claude",
    "ANTHROPIC_API_KEY",
    "no_claude_credentials",
    "No Claude credentials configured. Sign in with your Claude subscription or set an API key.",
    userId,
  );
}

async function deleteClaudeCredentials(userId: string): Promise<void> {
  return deleteProviderCredentials("claude", userId);
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

async function getOpenAICredentials(userId: string): Promise<CredentialStatus> {
  return getCredentials("openai", userId);
}

async function storeOpenAIApiKey(apiKey: string, userId: string): Promise<void> {
  return storeProviderApiKey("openai", apiKey, userId);
}

async function storeOpenAITokens(
  accessToken: string,
  refreshToken: string,
  expiresIn?: number,
  idToken?: string | null,
  userId?: string,
): Promise<void> {
  if (!userId) {
    throw new ApiError(401, "unauthorized", "User authentication required");
  }

  const key = getEncryptionKey();

  await convexServiceClient.mutation(api.serviceApi.upsertCredential, {
    provider: "openai",
    userId,
    source: "oauth" as const,
    encryptedAccessToken: encrypt(accessToken, key),
    encryptedRefreshToken: encrypt(refreshToken, key),
    encryptedApiKey: null,
    metadata: idToken ? { encryptedIdToken: encrypt(idToken, key) } : {},
    tokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
  });
}

function decryptOpenAIIdToken(metadata: unknown, key: string) {
  const openAIMetadata = metadata as OpenAICredentialMetadata | null;
  if (typeof openAIMetadata?.encryptedIdToken === "string") {
    return decrypt(openAIMetadata.encryptedIdToken, key);
  }

  return typeof openAIMetadata?.idToken === "string" ? openAIMetadata.idToken : undefined;
}

function resolveStoredCredentialRow(
  provider: Provider,
  row: any,
): ResolvedCredential | undefined {
  if (row?.source === "api_key" && row.encryptedApiKey) {
    const key = getEncryptionKey();
    return {
      type: "api_key",
      value: decrypt(row.encryptedApiKey, key),
    };
  }

  if (
    provider === "openai" &&
    row?.source === "oauth" &&
    row.encryptedAccessToken &&
    row.encryptedRefreshToken
  ) {
    const key = getEncryptionKey();
    const accessToken = decrypt(row.encryptedAccessToken, key);
    const refreshToken = decrypt(row.encryptedRefreshToken, key);
    const idToken = decryptOpenAIIdToken(row.metadata, key);

    return {
      type: "auth_json",
      value: JSON.stringify({
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          ...(idToken ? { id_token: idToken } : {}),
        },
      }),
    };
  }

  return undefined;
}

async function resolveOpenAICredential(userId: string): Promise<ResolvedCredential> {
  const row = await convexServiceClient.query(api.serviceApi.getCredential, {
    provider: "openai",
    userId,
  });

  if (row?.source === "api_key" && row.encryptedApiKey) {
    const key = getEncryptionKey();
    return {
      type: "api_key",
      value: decrypt(row.encryptedApiKey, key),
    };
  }

  if (row?.source === "oauth" && row.encryptedAccessToken && row.encryptedRefreshToken) {
    const key = getEncryptionKey();
    const accessToken = decrypt(row.encryptedAccessToken, key);
    const refreshToken = decrypt(row.encryptedRefreshToken, key);
    const idToken = decryptOpenAIIdToken(row.metadata, key);

    return {
      type: "auth_json",
      value: JSON.stringify({
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          ...(idToken ? { id_token: idToken } : {}),
        },
      }),
    };
  }

  const envApiKey = process.env.OPENAI_API_KEY;
  if (envApiKey) {
    return { type: "api_key", value: envApiKey };
  }

  throw new ApiError(
    422,
    "no_openai_credentials",
    "No OpenAI credentials configured. Connect your Codex account or set an API key.",
  );
}

async function deleteOpenAICredentials(userId: string): Promise<void> {
  return deleteProviderCredentials("openai", userId);
}

async function resolveCredential(userId: string): Promise<ResolvedCredential> {
  return resolveClaudeCredential(userId);
}

async function resolveCodexCredential(userId: string): Promise<ResolvedCredential> {
  return resolveOpenAICredential(userId);
}

async function resolveWorkspaceOwnerProviderCredential(
  provider: Provider,
  workspaceId: string,
  envFallbackKey: string,
  errorCode: string,
  errorMessage: string,
): Promise<ResolvedCredential> {
  const workspace = await convexServiceClient.query(api.serviceApi.getWorkspaceById, {
    workspaceId: asConvexId<"workspaces">(workspaceId),
  });

  if (workspace?.ownerId) {
    const row = await convexServiceClient.query(api.serviceApi.getCredential, {
      provider,
      userId: workspace.ownerId,
    });
    const credential = resolveStoredCredentialRow(provider, row);
    if (credential) {
      return credential;
    }
  }

  const envApiKey = process.env[envFallbackKey];
  if (envApiKey) {
    return { type: "api_key", value: envApiKey };
  }

  throw new ApiError(422, errorCode, errorMessage, {
    provider,
    workspaceId,
    requiresWorkspaceScopedCredential: true,
    workspaceScopedCredentialLookupImplemented: true,
  });
}

async function resolveGlobalProviderCredential(
  provider: Provider,
  workspaceId: string,
  envFallbackKey: string,
  errorCode: string,
  errorMessage: string,
): Promise<ResolvedCredential> {
  const envApiKey = process.env[envFallbackKey];
  if (envApiKey) {
    return { type: "api_key", value: envApiKey };
  }

  if (process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS !== "true") {
    throw new ApiError(422, errorCode, errorMessage, {
      provider,
      workspaceId,
      requiresWorkspaceScopedCredential: true,
      workspaceScopedCredentialLookupImplemented: false,
    });
  }

  const row = await convexServiceClient.query(api.serviceApi.getCredential, {
    provider,
    userId: null,
  });

  const credential = resolveStoredCredentialRow(provider, row);
  if (credential) {
    return credential;
  }

  throw new ApiError(422, errorCode, errorMessage, {
    provider,
    workspaceId,
    requiresWorkspaceScopedCredential: true,
    workspaceScopedCredentialLookupImplemented: false,
  });
}

async function resolveRunnerClaudeCredential(workspaceId: string): Promise<ResolvedCredential> {
  if (
    apiEnv.NODE_ENV !== "production" ||
    process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS === "true"
  ) {
    return resolveGlobalProviderCredential(
      "claude",
      workspaceId,
      "ANTHROPIC_API_KEY",
      "no_runner_claude_credentials",
      "No runner-safe Claude credentials configured. Production runners currently support env-backed credentials only for this workspace.",
    );
  }

  return resolveWorkspaceOwnerProviderCredential(
    "claude",
    workspaceId,
    "ANTHROPIC_API_KEY",
    "no_runner_claude_credentials",
    "No Claude account is connected for this workspace owner. Connect Claude in Settings -> Models, then retry.",
  );
}

async function resolveRunnerOpenAICredential(workspaceId: string): Promise<ResolvedCredential> {
  if (
    apiEnv.NODE_ENV !== "production" ||
    process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS === "true"
  ) {
    return resolveGlobalProviderCredential(
      "openai",
      workspaceId,
      "OPENAI_API_KEY",
      "no_runner_openai_credentials",
      "No runner-safe OpenAI credentials configured. Production runners currently support env-backed credentials only for this workspace.",
    );
  }

  return resolveWorkspaceOwnerProviderCredential(
    "openai",
    workspaceId,
    "OPENAI_API_KEY",
    "no_runner_openai_credentials",
    "No Codex account is connected for this workspace owner. Connect Codex in Settings -> Models, then retry.",
  );
}

export const credentialService = {
  // Claude
  getClaudeCredentials,
  storeClaudeApiKey,
  updateClaudeProfile,
  resolveCredential,
  resolveClaudeCredential,
  resolveRunnerClaudeCredential,
  deleteClaudeCredentials,
  // OpenAI
  getOpenAICredentials,
  storeOpenAIApiKey,
  storeOpenAITokens,
  resolveCodexCredential,
  resolveOpenAICredential,
  resolveRunnerOpenAICredential,
  deleteOpenAICredentials,
};
