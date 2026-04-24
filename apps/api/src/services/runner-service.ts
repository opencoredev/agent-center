import { createHash, randomBytes } from "node:crypto";

import { ApiError, notFoundError } from "../http/errors";
import { findWorkspaceById } from "../repositories/workspace-repository";
import {
  createRunnerRegistrationToken,
  findActiveRunnerRegistrationTokenByHash,
  findRunnerByAuthKeyHash,
  findRunnerById,
  findRunnerRegistrationTokenById,
  listRunnerRegistrationTokens,
  listRunners,
  registerRunnerWithToken,
  updateRunner,
  updateRunnerRegistrationToken,
} from "../repositories/runner-repository";
import { serializeRunner, serializeRunnerRegistrationToken } from "./serializers";

const REGISTRATION_TOKEN_TTL_MINUTES = 30;
const RUNNER_AUTH_TOKEN_PREFIX = "acr_";
const RUNNER_REGISTRATION_TOKEN_PREFIX = "acr_reg_";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRunnerAuthToken() {
  const token = `${RUNNER_AUTH_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;

  return {
    token,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 15),
  };
}

function createRegistrationToken() {
  const token = `${RUNNER_REGISTRATION_TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;

  return {
    token,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 19),
  };
}

function coerceExpiry(expiresInMinutes?: number) {
  const ttlMinutes = expiresInMinutes ?? REGISTRATION_TOKEN_TTL_MINUTES;
  return new Date(Date.now() + ttlMinutes * 60 * 1000);
}

async function assertWorkspaceAccess(workspaceId: string, userId?: string) {
  const workspace = await findWorkspaceById(workspaceId);

  if (workspace === undefined) {
    throw notFoundError("workspace", workspaceId);
  }

  if (userId && workspace.ownerId !== userId) {
    throw new ApiError(403, "workspace_forbidden", "You do not have access to this workspace", {
      workspaceId,
    });
  }

  return workspace;
}

export const runnerService = {
  async list(workspaceId: string, userId?: string) {
    await assertWorkspaceAccess(workspaceId, userId);

    const runnerList = await listRunners({ workspaceId });
    return runnerList.map(serializeRunner);
  },

  async listRegistrationTokens(workspaceId: string, userId?: string) {
    await assertWorkspaceAccess(workspaceId, userId);

    const tokens = await listRunnerRegistrationTokens({ workspaceId });
    return tokens.map(serializeRunnerRegistrationToken);
  },

  async createRegistrationToken(input: {
    workspaceId: string;
    name: string;
    expiresInMinutes?: number;
    createdByUserId?: string;
  }) {
    await assertWorkspaceAccess(input.workspaceId, input.createdByUserId);

    const registrationToken = createRegistrationToken();
    const record = await createRunnerRegistrationToken({
      workspaceId: input.workspaceId,
      name: input.name,
      tokenHash: registrationToken.tokenHash,
      tokenPrefix: registrationToken.tokenPrefix,
      expiresAt: coerceExpiry(input.expiresInMinutes),
      createdByUserId: input.createdByUserId ?? null,
    });

    return {
      ...serializeRunnerRegistrationToken(record),
      registrationToken: registrationToken.token,
    };
  },

  async revokeRunner(runnerId: string, userId?: string) {
    const existing = await findRunnerById(runnerId);

    if (existing === undefined) {
      throw notFoundError("runner", runnerId);
    }

    await assertWorkspaceAccess(existing.workspaceId, userId);

    const revokedRunner = await updateRunner(runnerId, {
      revokedAt: new Date(),
      updatedAt: new Date(),
    });

    if (revokedRunner === undefined) {
      throw notFoundError("runner", runnerId);
    }

    return {
      deleted: true as const,
      runner: serializeRunner(revokedRunner),
    };
  },

  async revokeRegistrationToken(registrationTokenId: string, userId?: string) {
    const existing = await findRunnerRegistrationTokenById(registrationTokenId);

    if (existing === undefined) {
      throw notFoundError("runner_registration_token", registrationTokenId);
    }

    await assertWorkspaceAccess(existing.workspaceId, userId);

    const revokedToken = await updateRunnerRegistrationToken(registrationTokenId, {
      revokedAt: new Date(),
      updatedAt: new Date(),
    });

    if (revokedToken === undefined) {
      throw notFoundError("runner_registration_token", registrationTokenId);
    }

    return {
      deleted: true as const,
      registrationToken: serializeRunnerRegistrationToken(revokedToken),
    };
  },

  async register(input: { registrationToken: string }) {
    const tokenHash = hashToken(input.registrationToken);
    const registrationToken = await findActiveRunnerRegistrationTokenByHash(tokenHash);

    if (registrationToken === undefined) {
      throw new ApiError(
        401,
        "invalid_runner_registration_token",
        "Runner registration token is invalid, expired, or already used",
      );
    }

    const authToken = createRunnerAuthToken();
    const now = new Date();

    const result = await registerRunnerWithToken({
      tokenHash,
      authKeyHash: authToken.tokenHash,
      authKeyPrefix: authToken.tokenPrefix,
      lastSeenAt: now,
    });

    if (result.status === "already_used") {
      throw new ApiError(
        409,
        "runner_registration_token_already_used",
        "Runner registration token has already been consumed",
      );
    }

    if (result.status !== "registered" || result.runner === null) {
      throw new ApiError(
        401,
        "invalid_runner_registration_token",
        "Runner registration token is invalid, expired, or already used",
      );
    }

    return {
      authToken: authToken.token,
      runner: serializeRunner(result.runner),
    };
  },

  async authenticate(token: string) {
    if (token.startsWith(RUNNER_REGISTRATION_TOKEN_PREFIX)) {
      throw new ApiError(401, "runner_unauthorized", "Runner registration tokens cannot be used for runner authentication");
    }

    if (!token.startsWith(RUNNER_AUTH_TOKEN_PREFIX)) {
      throw new ApiError(401, "runner_unauthorized", "Invalid runner token");
    }

    const runner = await findRunnerByAuthKeyHash(hashToken(token));

    if (runner === undefined || runner.revokedAt !== null) {
      throw new ApiError(401, "runner_unauthorized", "Invalid or revoked runner token");
    }

    void updateRunner(runner.id, {
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    }).catch((error) => {
      console.warn("[runner-service] failed to update lastSeenAt", error);
    });

    return runner;
  },
};
