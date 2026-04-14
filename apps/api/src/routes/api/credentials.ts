import { Hono } from "hono";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { validateJson } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { credentialService } from "../../services/credential-service";
import { apiKeySchema } from "../../validators/credentials";

export const credentialRoutes = new Hono<ApiEnv>();

// ── Claude ──────────────────────────────────────────────────────────────────

credentialRoutes.get("/claude", async (context) => {
  return runApiEffect(context, tryApiPromise(() => credentialService.getClaudeCredentials()));
});

credentialRoutes.delete("/claude", async (context) => {
  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.deleteClaudeCredentials();
      return { deleted: true };
    }),
  );
});

credentialRoutes.post("/claude/api-key", async (context) => {
  const { apiKey } = await validateJson(context, apiKeySchema);

  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.storeClaudeApiKey(apiKey);
      return credentialService.getClaudeCredentials();
    }),
  );
});

// ── OpenAI ──────────────────────────────────────────────────────────────────

credentialRoutes.get("/openai", async (context) => {
  return runApiEffect(context, tryApiPromise(() => credentialService.getOpenAICredentials()));
});

credentialRoutes.delete("/openai", async (context) => {
  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.deleteOpenAICredentials();
      return { deleted: true };
    }),
  );
});

credentialRoutes.post("/openai/api-key", async (context) => {
  const { apiKey } = await validateJson(context, apiKeySchema);

  return runApiEffect(
    context,
    tryApiPromise(async () => {
      await credentialService.storeOpenAIApiKey(apiKey);
      return credentialService.getOpenAICredentials();
    }),
  );
});
