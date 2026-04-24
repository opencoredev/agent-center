import { createHash, randomBytes } from "node:crypto";

import { api } from "@agent-center/control-plane/api";
import type { Id } from "@agent-center/control-plane/data-model";
import { Hono } from "hono";
import type { Context } from "hono";

import { ApiError } from "../../http/errors";
import { ok } from "../../http/responses";
import type { ApiEnv } from "../../http/types";
import { convexServiceClient } from "../../services/convex-service-client";

export const apiKeyRoutes = new Hono<ApiEnv>();

function requireUserId(context: Context<ApiEnv>): string {
  const userId = context.get("userId");
  if (!userId) {
    throw new ApiError(401, "unauthorized", "User authentication required");
  }
  return userId;
}

// POST /api/api-keys — create a new API key
apiKeyRoutes.post("/", async (context) => {
  const body = await context.req.json<{ name: string; expiresInDays?: number }>();

  if (!body.name || typeof body.name !== "string") {
    throw new ApiError(400, "bad_request", "name is required");
  }

  const rawKey = `ac_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 11); // "ac_" + first 8 hex chars

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const userId = requireUserId(context);

  const apiKey = await convexServiceClient.mutation(api.serviceApi.createApiKey, {
    userId: userId as Id<"users">,
    name: body.name,
    keyHash,
    keyPrefix,
    expiresAt: expiresAt?.getTime(),
  });

  if (!apiKey) {
    throw new ApiError(500, "api_key_create_failed", "Failed to create API key");
  }

  return ok(
    context,
    {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      expiresAt: apiKey.expiresAt ? new Date(apiKey.expiresAt).toISOString() : null,
      createdAt: new Date(apiKey.createdAt ?? apiKey._creationTime).toISOString(),
      // The raw key is only returned once — the user must save it
      key: rawKey,
    },
    201,
  );
});

// GET /api/api-keys — list the current user's API keys (never returns full key)
apiKeyRoutes.get("/", async (context) => {
  const userId = requireUserId(context);

  const keys = await convexServiceClient.query(api.serviceApi.listApiKeysByUser, {
    userId: userId as Id<"users">,
  });

  return ok(
    context,
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
      expiresAt: k.expiresAt ? new Date(k.expiresAt).toISOString() : null,
      createdAt: new Date(k.createdAt ?? k._creationTime).toISOString(),
    })),
  );
});

// DELETE /api/api-keys/:id — revoke an API key
apiKeyRoutes.delete("/:id", async (context) => {
  const { id } = context.req.param();
  const userId = requireUserId(context);

  const deleted = await convexServiceClient.mutation(api.serviceApi.deleteApiKey, {
    apiKeyId: id as Id<"apiKeys">,
    userId: userId as Id<"users">,
  });

  if (!deleted) {
    throw new ApiError(404, "not_found", "API key not found");
  }

  return ok(context, { deleted: true });
});
