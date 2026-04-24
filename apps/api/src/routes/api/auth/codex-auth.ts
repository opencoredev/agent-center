import { Hono } from "hono";
import { z } from "zod";

import type { ApiEnv } from "../../../http/types";
import { ok } from "../../../http/responses";
import { ApiError } from "../../../http/errors";
import { validateJson } from "../../../http/validation";
import { credentialService } from "../../../services/credential-service";

export const authCodexRoutes = new Hono<ApiEnv>();

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";

const authJsonSchema = z.object({
  authJson: z.string().min(1, "Auth JSON is required"),
});

/**
 * Save Codex credentials from ~/.codex/auth.json.
 *
 * Flow:
 * 1. User runs `codex login` locally
 * 2. User copies contents of ~/.codex/auth.json
 * 3. Client sends the JSON here
 * 4. We validate by refreshing the token
 * 5. We store the refreshed tokens
 */
authCodexRoutes.post("/codex/save-auth", async (context) => {
  const { authJson } = await validateJson(context, authJsonSchema);
  const userId = context.get("userId");

  if (!userId) {
    throw new ApiError(401, "unauthorized", "User authentication required");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(authJson);
  } catch {
    throw new ApiError(
      400,
      "invalid_json",
      "Invalid JSON. Copy the exact contents of ~/.codex/auth.json",
    );
  }

  // Validate shape
  const shape = z.object({
    tokens: z.object({
      access_token: z.string(),
      refresh_token: z.string(),
      id_token: z.string().optional(),
    }),
  });

  const result = shape.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(
      400,
      "invalid_format",
      "Invalid auth.json format. Make sure you copied the complete file contents.",
    );
  }

  const { tokens } = result.data;

  // Validate by refreshing the token
  const refreshRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: OPENAI_CLIENT_ID,
      scope: "openid profile email",
    }),
  });

  if (!refreshRes.ok) {
    console.error("[codex-auth] Token refresh failed with status", refreshRes.status);
    throw new ApiError(
      400,
      "token_invalid",
      "Token refresh failed. Please run `codex login` again and paste fresh auth.json.",
    );
  }

  const refreshData = (await refreshRes.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };

  // Store the refreshed tokens
  await credentialService.storeOpenAITokens(
    refreshData.access_token,
    refreshData.refresh_token ?? tokens.refresh_token,
    refreshData.expires_in,
    refreshData.id_token ?? tokens.id_token ?? null,
    userId,
  );

  const status = await credentialService.getOpenAICredentials(userId);
  return ok(context, status);
});
