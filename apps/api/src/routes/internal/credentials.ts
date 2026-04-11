import { Hono } from "hono";

import { ok } from "../../http/responses";
import type { ApiEnv } from "../../http/types";
import { credentialService } from "../../services/credential-service";

export const internalCredentialRoutes = new Hono<ApiEnv>();

internalCredentialRoutes.get("/claude/resolve", async (context) => {
  const credential = await credentialService.resolveCredential();

  return ok(context, credential);
});

internalCredentialRoutes.get("/openai/resolve", async (context) => {
  const credential = await credentialService.resolveCodexCredential();

  return ok(context, credential);
});
