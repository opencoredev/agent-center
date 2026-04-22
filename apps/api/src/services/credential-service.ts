import type { CredentialStatus, ResolvedCredential } from "@agent-center/shared";
import { decrypt, encrypt } from "@agent-center/shared";
import { db, credentials } from "@agent-center/db";
import { eq } from "drizzle-orm";

import { ApiError } from "../http/errors";
import { apiEnv } from "../env";

type Provider = "claude" | "openai";

function getEncryptionKey(): string {
  const key = apiEnv.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new ApiError(500, "encryption_not_configured", "CREDENTIAL_ENCRYPTION_KEY is not set");
  }
  return key;
}

// ── Generic helpers (shared by all providers) ───────────────────────────────

async function getCredentials(provider: Provider): Promise<CredentialStatus> {
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.provider, provider))
    .limit(1);

  const row = rows[0];

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
    email: row.profileEmail,
    expiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    subscriptionType: row.subscriptionType,
  };
}

async function storeProviderApiKey(provider: Provider, apiKey: string): Promise<void> {
  const key = getEncryptionKey();
  const encryptedApiKey = encrypt(apiKey, key);

  const existing = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.provider, provider))
    .limit(1);

  const values = {
    source: "api_key" as const,
    encryptedApiKey,
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(credentials).set(values).where(eq(credentials.id, existing[0].id));
  } else {
    await db.insert(credentials).values({
      provider,
      ...values,
    });
  }
}

async function resolveProviderCredential(
  provider: Provider,
  envFallbackKey: string,
  errorCode: string,
  errorMessage: string,
): Promise<ResolvedCredential> {
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.provider, provider))
    .limit(1);

  const row = rows[0];

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

async function deleteProviderCredentials(provider: Provider): Promise<void> {
  await db.delete(credentials).where(eq(credentials.provider, provider));
}

// ── Claude ──────────────────────────────────────────────────────────────────

async function getClaudeCredentials(): Promise<CredentialStatus> {
  return getCredentials("claude");
}

async function storeClaudeApiKey(apiKey: string): Promise<void> {
  return storeProviderApiKey("claude", apiKey);
}

async function updateClaudeProfile(
  email: string | null,
  subscriptionType: string | null,
): Promise<void> {
  const existing = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.provider, "claude"))
    .limit(1);

  if (existing[0]) {
    await db
      .update(credentials)
      .set({
        profileEmail: email,
        subscriptionType,
        updatedAt: new Date(),
      })
      .where(eq(credentials.id, existing[0].id));
  }
}

async function resolveClaudeCredential(): Promise<ResolvedCredential> {
  return resolveProviderCredential(
    "claude",
    "ANTHROPIC_API_KEY",
    "no_claude_credentials",
    "No Claude credentials configured. Sign in with your Claude subscription or set an API key.",
  );
}

async function deleteClaudeCredentials(): Promise<void> {
  return deleteProviderCredentials("claude");
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

async function getOpenAICredentials(): Promise<CredentialStatus> {
  return getCredentials("openai");
}

async function storeOpenAIApiKey(apiKey: string): Promise<void> {
  return storeProviderApiKey("openai", apiKey);
}

async function storeOpenAITokens(
  accessToken: string,
  refreshToken: string,
  expiresIn?: number,
  idToken?: string | null,
): Promise<void> {
  const key = getEncryptionKey();

  const existing = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.provider, "openai"))
    .limit(1);

  const values = {
    source: "oauth" as const,
    encryptedAccessToken: encrypt(accessToken, key),
    encryptedRefreshToken: encrypt(refreshToken, key),
    encryptedApiKey: null,
    metadata: idToken ? { idToken } : {},
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(credentials).set(values).where(eq(credentials.id, existing[0].id));
  } else {
    await db.insert(credentials).values({
      provider: "openai",
      ...values,
    });
  }
}

async function resolveOpenAICredential(): Promise<ResolvedCredential> {
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.provider, "openai"))
    .limit(1);

  const row = rows[0];

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
    const metadata = row.metadata as { idToken?: unknown } | null;
    const idToken = typeof metadata?.idToken === "string" ? metadata.idToken : undefined;

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

async function deleteOpenAICredentials(): Promise<void> {
  return deleteProviderCredentials("openai");
}

async function resolveCredential(): Promise<ResolvedCredential> {
  return resolveClaudeCredential();
}

async function resolveCodexCredential(): Promise<ResolvedCredential> {
  return resolveOpenAICredential();
}

function resolveRunnerEnvCredential(
  provider: Provider,
  workspaceId: string,
  envFallbackKey: string,
  errorCode: string,
  errorMessage: string,
): ResolvedCredential {
  const envApiKey = process.env[envFallbackKey];
  if (envApiKey) {
    return { type: "api_key", value: envApiKey };
  }

  throw new ApiError(422, errorCode, errorMessage, {
    provider,
    workspaceId,
    requiresWorkspaceScopedCredential: true,
    workspaceScopedCredentialLookupImplemented: false,
  });
}

async function resolveRunnerClaudeCredential(workspaceId: string): Promise<ResolvedCredential> {
  if (apiEnv.NODE_ENV !== "production" || process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS === "true") {
    return resolveClaudeCredential();
  }

  return resolveRunnerEnvCredential(
    "claude",
    workspaceId,
    "ANTHROPIC_API_KEY",
    "no_runner_claude_credentials",
    "No runner-safe Claude credentials configured. Production runners currently support env-backed credentials only for this workspace.",
  );
}

async function resolveRunnerOpenAICredential(workspaceId: string): Promise<ResolvedCredential> {
  if (apiEnv.NODE_ENV !== "production" || process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS === "true") {
    return resolveOpenAICredential();
  }

  return resolveRunnerEnvCredential(
    "openai",
    workspaceId,
    "OPENAI_API_KEY",
    "no_runner_openai_credentials",
    "No runner-safe OpenAI credentials configured. Production runners currently support env-backed credentials only for this workspace.",
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
