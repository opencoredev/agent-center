import { Hono } from "hono";
import type { Context } from "hono";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { getCredentialUserId } from "../../http/auth-user";
import { ApiError } from "../../http/errors";
import { validateJson } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { credentialService } from "../../services/credential-service";
import { apiKeySchema } from "../../validators/credentials";

export const credentialRoutes = new Hono<ApiEnv>();

function requireUserId(context: Context<ApiEnv>): string {
  const userId = getCredentialUserId(context);
  if (!userId) {
    throw new ApiError(401, "unauthorized", "User authentication required");
  }
  return userId;
}

// ── Claude ──────────────────────────────────────────────────────────────────

credentialRoutes.get("/claude", async (context) => {
  const userId = requireUserId(context);
  return runApiEffect(
    context,
    tryApiPromise(() => credentialService.getClaudeCredentials(userId)),
  );
});

credentialRoutes.delete("/claude", async (context) => {
  const userId = requireUserId(context);
  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.deleteClaudeCredentials(userId);
      return { deleted: true };
    }),
  );
});

credentialRoutes.post("/claude/api-key", async (context) => {
  const { apiKey } = await validateJson(context, apiKeySchema);
  const userId = requireUserId(context);

  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.storeClaudeApiKey(apiKey, userId);
      return credentialService.getClaudeCredentials(userId);
    }),
  );
});

// ── OpenAI ──────────────────────────────────────────────────────────────────

credentialRoutes.get("/openai", async (context) => {
  const userId = requireUserId(context);
  return runApiEffect(
    context,
    tryApiPromise(() => credentialService.getOpenAICredentials(userId)),
  );
});

credentialRoutes.delete("/openai", async (context) => {
  const userId = requireUserId(context);
  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.deleteOpenAICredentials(userId);
      return { deleted: true };
    }),
  );
});

credentialRoutes.post("/openai/api-key", async (context) => {
  const { apiKey } = await validateJson(context, apiKeySchema);
  const userId = requireUserId(context);

  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.storeOpenAIApiKey(apiKey, userId);
      return credentialService.getOpenAICredentials(userId);
    }),
  );
});
