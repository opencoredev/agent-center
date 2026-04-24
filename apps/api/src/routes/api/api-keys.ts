import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";

import { db, apiKeys } from "@agent-center/db";

import { ApiError } from "../../http/errors";
import { ok } from "../../http/responses";
import type { ApiEnv } from "../../http/types";

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

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      userId,
      name: body.name,
      keyHash,
      keyPrefix,
      expiresAt,
    })
    .returning();

  return ok(
    context,
    {
      id: apiKey!.id,
      name: apiKey!.name,
      keyPrefix: apiKey!.keyPrefix,
      expiresAt: apiKey!.expiresAt?.toISOString() ?? null,
      createdAt: apiKey!.createdAt.toISOString(),
      // The raw key is only returned once — the user must save it
      key: rawKey,
    },
    201,
  );
});

// GET /api/api-keys — list the current user's API keys (never returns full key)
apiKeyRoutes.get("/", async (context) => {
  const userId = requireUserId(context);

  const keys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));

  return ok(
    context,
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  );
});

// DELETE /api/api-keys/:id — revoke an API key
apiKeyRoutes.delete("/:id", async (context) => {
  const { id } = context.req.param();
  const userId = requireUserId(context);

  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .returning();

  if (!deleted) {
    throw new ApiError(404, "not_found", "API key not found");
  }

  return ok(context, { deleted: true });
});
