import { Hono } from "hono";

import { ok } from "../../http/responses";
import { validateJson } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { credentialService } from "../../services/credential-service";
import { apiKeySchema } from "../../validators/credentials";

export const credentialRoutes = new Hono<ApiEnv>();

credentialRoutes.get("/claude", async (context) => {
  const status = await credentialService.getClaudeCredentials();

  return ok(context, status);
});

credentialRoutes.delete("/claude", async (context) => {
  await credentialService.deleteCredentials();

  return ok(context, { deleted: true });
});

credentialRoutes.post("/claude/api-key", async (context) => {
  const { apiKey } = await validateJson(context, apiKeySchema);
  await credentialService.storeApiKey(apiKey);
  const status = await credentialService.getClaudeCredentials();

  return ok(context, status);
});
