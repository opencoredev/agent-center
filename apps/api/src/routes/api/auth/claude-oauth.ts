import { Hono } from "hono";
import { z } from "zod";

import type { ApiEnv } from "../../../http/types";
import { ok } from "../../../http/responses";
import { ApiError } from "../../../http/errors";
import { validateJson } from "../../../http/validation";
import { credentialService } from "../../../services/credential-service";

export const authClaudeOAuthRoutes = new Hono<ApiEnv>();

const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const CREATE_API_KEY_URL = "https://api.anthropic.com/api/oauth/claude_cli/create_api_key";
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";

const exchangeSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  codeVerifier: z.string().min(1, "Code verifier is required"),
});

/**
 * Exchange an authorization code (from Claude OAuth popup) for an API key.
 *
 * Flow:
 * 1. Client opens popup to claude.ai/oauth/authorize with PKCE
 * 2. User authorizes, gets code from Anthropic callback page
 * 3. Client sends code + codeVerifier here
 * 4. We exchange for access token
 * 5. We create an API key from that token
 * 6. We store the encrypted API key
 */
authClaudeOAuthRoutes.post("/claude/exchange", async (context) => {
  const { code, codeVerifier } = await validateJson(context, exchangeSchema);

  // Step 1: Exchange authorization code for access token
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLAUDE_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[claude-oauth] Token exchange failed:", tokenRes.status, errText);
    // Surface the actual error from Anthropic
    let msg = "Failed to exchange authorization code. Please try again.";
    try {
      const errJson = JSON.parse(errText) as { error?: { message?: string; type?: string } };
      if (errJson.error?.type === "rate_limit_error") {
        msg = "Rate limited by Anthropic. Wait a minute and try again.";
      } else if (errJson.error?.message) {
        msg = errJson.error.message;
      }
    } catch { /* ignore parse errors */ }
    throw new ApiError(400, "token_exchange_failed", msg);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
  };

  // Step 2: Fetch profile info
  let email: string | null = null;
  let subscriptionType: string | null = null;

  try {
    const profileRes = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as {
        email?: string;
        account_type?: string;
        organization_type?: string;
      };
      email = profile.email ?? null;
      subscriptionType = profile.account_type ?? profile.organization_type ?? null;
    }
  } catch {
    // Profile fetch is non-critical
  }

  // Step 3: Create an API key from the access token
  const apiKeyRes = await fetch(CREATE_API_KEY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "agent-center" }),
  });

  if (!apiKeyRes.ok) {
    const errText = await apiKeyRes.text();
    console.error("[claude-oauth] API key creation failed:", errText);
    throw new ApiError(400, "api_key_creation_failed", "Authorized successfully but failed to create API key. Your account may not have API access.");
  }

  const apiKeyData = (await apiKeyRes.json()) as { api_key: string };

  // Step 4: Store the API key
  await credentialService.storeClaudeApiKey(apiKeyData.api_key);

  // Step 5: Update profile info if we got it
  if (email || subscriptionType) {
    await credentialService.updateClaudeProfile(email, subscriptionType);
  }

  const status = await credentialService.getClaudeCredentials();
  return ok(context, status);
});
