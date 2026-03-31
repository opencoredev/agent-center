import type { CredentialStatus, ResolvedCredential } from "@agent-center/shared";
import { decrypt, encrypt } from "@agent-center/shared";
import { db, credentials } from "@agent-center/db";
import { eq } from "drizzle-orm";

import { ApiError } from "../http/errors";
import { apiEnv } from "../env";

function getEncryptionKey(): string {
  const key = apiEnv.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new ApiError(500, "encryption_not_configured", "CREDENTIAL_ENCRYPTION_KEY is not set");
  }
  return key;
}

async function getClaudeCredentials(): Promise<CredentialStatus> {
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.provider, "claude"))
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
    source: row.source as "api_key",
    email: row.profileEmail,
    expiresAt: null,
    subscriptionType: row.subscriptionType,
  };
}

async function storeApiKey(apiKey: string): Promise<void> {
  const key = getEncryptionKey();
  const encryptedApiKey = encrypt(apiKey, key);

  const existing = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.provider, "claude"))
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
    await db
      .update(credentials)
      .set(values)
      .where(eq(credentials.id, existing[0].id));
  } else {
    await db.insert(credentials).values({
      provider: "claude",
      ...values,
    });
  }
}

async function resolveCredential(): Promise<ResolvedCredential> {
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.provider, "claude"))
    .limit(1);

  const row = rows[0];

  if (row?.source === "api_key" && row.encryptedApiKey) {
    const key = getEncryptionKey();
    return {
      type: "api_key",
      value: decrypt(row.encryptedApiKey, key),
    };
  }

  const envApiKey = process.env.ANTHROPIC_API_KEY;
  if (envApiKey) {
    return { type: "api_key", value: envApiKey };
  }

  throw new ApiError(
    422,
    "no_claude_credentials",
    "No Claude credentials configured. Set an API key or ensure the host has an authenticated Claude CLI session.",
  );
}

async function deleteCredentials(): Promise<void> {
  await db.delete(credentials).where(eq(credentials.provider, "claude"));
}

export const credentialService = {
  getClaudeCredentials,
  storeApiKey,
  resolveCredential,
  deleteCredentials,
};
