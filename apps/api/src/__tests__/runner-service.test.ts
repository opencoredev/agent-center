import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

const ownedWorkspace = {
  id: "11111111-1111-1111-1111-111111111111",
  ownerId: "user-1",
};

const otherWorkspace = {
  id: "22222222-2222-2222-2222-222222222222",
  ownerId: "user-2",
};

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-02T00:00:00.000Z");
const expiresAt = new Date("2026-01-03T00:00:00.000Z");
const consumedAt = new Date("2026-01-04T00:00:00.000Z");

const registrationTokenValue = "acr_reg_111111111111111111111111111111111111111111111111";
const registrationTokenHash = createHash("sha256").update(registrationTokenValue).digest("hex");

const runnerTokenValue = "acr_2222222222222222222222222222222222222222222222222222";

const ownedRunner = {
  id: "runner-1",
  workspaceId: ownedWorkspace.id,
  name: "runner-one",
  authKeyPrefix: runnerTokenValue.slice(0, 15),
  authKeyHash: createHash("sha256").update(runnerTokenValue).digest("hex"),
  lastSeenAt: createdAt,
  revokedAt: null,
  createdByUserId: "user-1",
  createdAt,
  updatedAt,
};

const activeRegistrationToken = {
  id: "reg-1",
  workspaceId: ownedWorkspace.id,
  name: "runner-one",
  tokenHash: registrationTokenHash,
  tokenPrefix: registrationTokenValue.slice(0, 19),
  expiresAt,
  consumedAt: null,
  revokedAt: null,
  createdByUserId: "user-1",
  createdAt,
  updatedAt,
};

let registrationTokenConsumed = false;

mock.module("@agent-center/db", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => {
                if (registrationTokenConsumed) {
                  return [];
                }

                registrationTokenConsumed = true;

                return [
                  {
                    ...activeRegistrationToken,
                    consumedAt,
                    updatedAt: consumedAt,
                  },
                ];
              },
            }),
          }),
        }),
        insert: () => ({
          values: () => ({
            returning: async () => [ownedRunner],
          }),
        }),
      }),
  },
  runnerRegistrationTokens: {
    id: "id",
    workspaceId: "workspaceId",
    name: "name",
    tokenHash: "tokenHash",
    tokenPrefix: "tokenPrefix",
    expiresAt: "expiresAt",
    consumedAt: "consumedAt",
    revokedAt: "revokedAt",
    createdByUserId: "createdByUserId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  runners: {
    id: "id",
    workspaceId: "workspaceId",
    name: "name",
    authKeyHash: "authKeyHash",
    authKeyPrefix: "authKeyPrefix",
    lastSeenAt: "lastSeenAt",
    revokedAt: "revokedAt",
    createdByUserId: "createdByUserId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
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

const mockFindWorkspaceById = mock(async (workspaceId: string) => {
  if (workspaceId === ownedWorkspace.id) {
    return ownedWorkspace;
  }

  if (workspaceId === otherWorkspace.id) {
    return otherWorkspace;
  }

  return undefined;
});

const mockFindActiveRunnerRegistrationTokenByHash = mock(async (tokenHash: string) => {
  if (tokenHash === registrationTokenHash) {
    return activeRegistrationToken;
  }

  return undefined;
});

const mockCreateRunnerRegistrationToken = mock(async () => activeRegistrationToken);
const mockFindRunnerByAuthKeyHash = mock(async (authKeyHash: string) => {
  if (authKeyHash === ownedRunner.authKeyHash) {
    return ownedRunner;
  }

  return undefined;
});
const mockFindRunnerById = mock(async () => ownedRunner);
const mockFindRunnerRegistrationTokenById = mock(async () => activeRegistrationToken);
const mockListRunnerRegistrationTokens = mock(async () => []);
const mockListRunners = mock(async () => []);
const mockRegisterRunnerWithToken = mock(async () => {
  if (registrationTokenConsumed) {
    return {
      status: "already_used" as const,
      runner: null,
    };
  }

  registrationTokenConsumed = true;

  return {
    status: "registered" as const,
    runner: ownedRunner,
  };
});
const mockUpdateRunner = mock(async () => ownedRunner);
const mockUpdateRunnerRegistrationToken = mock(async () => activeRegistrationToken);

mock.module("../repositories/workspace-repository", () => ({
  createWorkspace: mock(async (values: Record<string, unknown>) => values),
  findWorkspaceById: mockFindWorkspaceById,
  listWorkspaces: mock(async () => [ownedWorkspace, otherWorkspace]),
}));

mock.module("../repositories/runner-repository", () => ({
  createRunnerRegistrationToken: mockCreateRunnerRegistrationToken,
  findActiveRunnerRegistrationTokenByHash: mockFindActiveRunnerRegistrationTokenByHash,
  findRunnerByAuthKeyHash: mockFindRunnerByAuthKeyHash,
  findRunnerById: mockFindRunnerById,
  findRunnerRegistrationTokenById: mockFindRunnerRegistrationTokenById,
  listRunnerRegistrationTokens: mockListRunnerRegistrationTokens,
  listRunners: mockListRunners,
  registerRunnerWithToken: mockRegisterRunnerWithToken,
  updateRunner: mockUpdateRunner,
  updateRunnerRegistrationToken: mockUpdateRunnerRegistrationToken,
}));

mock.module("../services/serializers", () => ({
  serializeWorkspace: (workspace: Record<string, unknown>) => workspace,
  serializePublicationState: () => ({
    status: "unpublished",
    pullRequest: null,
  }),
  serializeRepoConnection: (
    repoConnection: { createdAt: Date; updatedAt: Date } & Record<string, unknown>,
  ) => ({
    ...repoConnection,
    createdAt: repoConnection.createdAt.toISOString(),
    updatedAt: repoConnection.updatedAt.toISOString(),
  }),
  serializeRunner: (runner: typeof ownedRunner) => ({
    id: runner.id,
    workspaceId: runner.workspaceId,
    name: runner.name,
    authKeyPrefix: runner.authKeyPrefix,
    lastSeenAt: runner.lastSeenAt.toISOString(),
    revokedAt: runner.revokedAt,
    createdAt: runner.createdAt.toISOString(),
    updatedAt: runner.updatedAt.toISOString(),
  }),
  serializeRunnerRegistrationToken: (token: typeof activeRegistrationToken) => ({
    id: token.id,
    workspaceId: token.workspaceId,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    expiresAt: token.expiresAt.toISOString(),
    consumedAt: token.consumedAt,
    revokedAt: token.revokedAt,
    createdAt: token.createdAt.toISOString(),
    updatedAt: token.updatedAt.toISOString(),
  }),
  serializeRun: (run: Record<string, unknown>) => run,
  serializeRunEvent: (event: Record<string, unknown>) => event,
  serializeTask: (task: Record<string, unknown>) => task,
}));

const runnerServiceModulePath = "../services/runner-service.ts?runner-service-test";
const { runnerService } = (await import(
  runnerServiceModulePath
)) as typeof import("../services/runner-service");
mock.restore();

describe("runner-service", () => {
  beforeEach(() => {
    registrationTokenConsumed = false;
    mockFindWorkspaceById.mockClear();
    mockFindActiveRunnerRegistrationTokenByHash.mockClear();
    mockCreateRunnerRegistrationToken.mockClear();
    mockFindRunnerByAuthKeyHash.mockClear();
    mockFindRunnerById.mockClear();
    mockFindRunnerRegistrationTokenById.mockClear();
    mockListRunnerRegistrationTokens.mockClear();
    mockListRunners.mockClear();
    mockRegisterRunnerWithToken.mockClear();
    mockUpdateRunner.mockClear();
    mockUpdateRunnerRegistrationToken.mockClear();
  });

  test("rejects runner registration management for a workspace the caller does not own", async () => {
    try {
      await runnerService.createRegistrationToken({
        workspaceId: otherWorkspace.id,
        name: "runner-two",
        createdByUserId: "user-1",
      });

      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      expect((error as { code: string }).code).toBe("workspace_forbidden");
      expect((error as { status: number }).status).toBe(403);
    }
  });

  test("consumes a registration token once and rejects reuse", async () => {
    const firstResult = await runnerService.register({
      registrationToken: registrationTokenValue,
    });

    expect(firstResult.authToken.startsWith("acr_")).toBe(true);
    expect(firstResult.runner).toMatchObject({
      id: ownedRunner.id,
      workspaceId: ownedRunner.workspaceId,
      name: ownedRunner.name,
      authKeyPrefix: runnerTokenValue.slice(0, 15),
    });
    expect(mockFindActiveRunnerRegistrationTokenByHash).toHaveBeenCalledTimes(1);
    expect(mockFindActiveRunnerRegistrationTokenByHash).toHaveBeenCalledWith(registrationTokenHash);

    try {
      await runnerService.register({
        registrationToken: registrationTokenValue,
      });

      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      expect((error as { code: string }).code).toBe("runner_registration_token_already_used");
      expect((error as { status: number }).status).toBe(409);
    }
  });

  test("rejects runner tokens without the required prefix", async () => {
    try {
      await runnerService.authenticate("not-a-runner-token");

      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      expect((error as { code: string }).code).toBe("runner_unauthorized");
      expect((error as { status: number }).status).toBe(401);
    }
  });
});
