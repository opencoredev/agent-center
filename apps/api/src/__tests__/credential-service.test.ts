import { describe, expect, test, mock, beforeEach } from "bun:test";
import { encrypt } from "@agent-center/shared";

const mockSelectResult: unknown[] = [];
let mockInsertCalled = false;
let mockUpdateCalled = false;
let mockDeleteCalled = false;

const mockLimit = mock(() => Promise.resolve(mockSelectResult));
const mockWhere = mock(() => ({ limit: mockLimit }));
const mockFrom = mock(() => ({ where: mockWhere }));
const mockSelect = mock(() => ({ from: mockFrom }));

const mockOnConflictDoUpdate = mock(() => Promise.resolve());
const mockInsertValues = mock(() => {
  mockInsertCalled = true;
  return { onConflictDoUpdate: mockOnConflictDoUpdate };
});
const mockInsert = mock(() => ({ values: mockInsertValues }));

const mockUpdateWhere = mock(() => {
  mockUpdateCalled = true;
  return Promise.resolve();
});
const mockUpdateSet = mock(() => ({ where: mockUpdateWhere }));
const mockUpdate = mock(() => ({ set: mockUpdateSet }));

const mockDeleteWhere = mock(() => {
  mockDeleteCalled = true;
  return Promise.resolve();
});
const mockDelete = mock(() => ({ where: mockDeleteWhere }));

mock.module("@agent-center/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  credentials: {
    provider: "provider",
    id: "id",
    source: "source",
    encryptedApiKey: "encryptedApiKey",
    encryptedAccessToken: "encryptedAccessToken",
    tokenExpiresAt: "tokenExpiresAt",
    encryptedRefreshToken: "encryptedRefreshToken",
    profileEmail: "profileEmail",
    profileName: "profileName",
    subscriptionType: "subscriptionType",
    metadata: "metadata",
    updatedAt: "updatedAt",
  },
}));

mock.module("drizzle-orm", () => ({
  eq: (...args: unknown[]) => args,
}));

mock.module("../env", () => ({
  apiEnv: {
    CREDENTIAL_ENCRYPTION_KEY: "test-encryption-key-for-unit-tests",
  },
}));

const { credentialService } = await import("../services/credential-service");

describe("credential-service", () => {
  beforeEach(() => {
    mockSelectResult.length = 0;
    mockInsertCalled = false;
    mockUpdateCalled = false;
    mockDeleteCalled = false;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe("getClaudeCredentials", () => {
    test("returns disconnected when no DB rows", async () => {
      const result = await credentialService.getClaudeCredentials();
      expect(result.connected).toBe(false);
      expect(result.source).toBeNull();
      expect(result.email).toBeNull();
      expect(result.expiresAt).toBeNull();
      expect(result.subscriptionType).toBeNull();
    });

    test("returns connected when DB row exists", async () => {
      mockSelectResult.push({
        provider: "claude",
        source: "api_key",
        profileEmail: null,
        tokenExpiresAt: null,
        subscriptionType: null,
      });

      const result = await credentialService.getClaudeCredentials();
      expect(result.connected).toBe(true);
      expect(result.source).toBe("api_key");
      expect(result.expiresAt).toBeNull();
    });
  });

  describe("resolveCredential", () => {
    test("returns env API key when no DB creds and ANTHROPIC_API_KEY set", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const result = await credentialService.resolveCredential();
      expect(result.type).toBe("api_key");
      expect(result.value).toBe("sk-ant-test-key");
    });

    test("throws no_claude_credentials when no creds at all", async () => {
      try {
        await credentialService.resolveCredential();
        expect.unreachable("should have thrown");
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe("no_claude_credentials");
        expect((error as { status: number }).status).toBe(422);
      }
    });

    test("returns decrypted API key from DB row", async () => {
      const encKey = "test-encryption-key-for-unit-tests";
      const encryptedApiKey = encrypt("sk-ant-db-key", encKey);

      mockSelectResult.push({
        id: "cred-1",
        provider: "claude",
        source: "api_key",
        encryptedApiKey,
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
      });

      const result = await credentialService.resolveCredential();
      expect(result.type).toBe("api_key");
      expect(result.value).toBe("sk-ant-db-key");
    });
  });

  describe("resolveCodexCredential", () => {
    test("returns reconstructed auth.json from stored oauth tokens", async () => {
      const encKey = "test-encryption-key-for-unit-tests";
      const encryptedAccessToken = encrypt("oauth-access-token", encKey);
      const encryptedRefreshToken = encrypt("oauth-refresh-token", encKey);

      mockSelectResult.push({
        id: "cred-openai-1",
        provider: "openai",
        source: "oauth",
        encryptedApiKey: null,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null,
        metadata: { idToken: "oauth-id-token" },
      });

      const result = await credentialService.resolveCodexCredential();
      expect(result.type).toBe("auth_json");
      expect(JSON.parse(result.value)).toEqual({
        tokens: {
          access_token: "oauth-access-token",
          refresh_token: "oauth-refresh-token",
          id_token: "oauth-id-token",
        },
      });
    });
  });
});
