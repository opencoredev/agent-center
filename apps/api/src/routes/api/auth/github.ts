import { randomBytes } from "node:crypto";

import { api } from "@agent-center/control-plane/api";
import type { Id } from "@agent-center/control-plane/data-model";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { ApiError } from "../../../http/errors";
import type { ApiEnv } from "../../../http/types";
import { convexServiceClient } from "../../../services/convex-service-client";
import { githubAppService } from "../../../services/github-app-service";
import { hashSessionToken } from "../../../services/session-token-service";

export const authGitHubRoutes = new Hono<ApiEnv>();

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const STATE_EXPIRY_MS = 10 * 60 * 1000;
const GITHUB_OAUTH_STATE_COOKIE = "agent_center_github_oauth_state";

function getGitHubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    redirectUri:
      process.env.GITHUB_APP_CALLBACK_URL || "http://localhost:3100/api/auth/github/callback",
    webUrl: process.env.VITE_WEB_URL || "http://localhost:3100",
  };
}

async function fetchGitHubEmail(accessToken: string) {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Agent-Center",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    return null;
  }

  const emails = (await response.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  return (
    emails.find((email) => email.primary && email.verified)?.email ??
    emails.find((email) => email.verified)?.email ??
    null
  );
}

authGitHubRoutes.get("/github/start", (context) => {
  const { clientId, redirectUri } = getGitHubOAuthConfig();

  if (!clientId) {
    throw new ApiError(501, "github_oauth_not_configured", "GitHub OAuth is not configured");
  }

  const state = randomBytes(16).toString("hex");
  setCookie(context, GITHUB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: STATE_EXPIRY_MS / 1000,
    path: "/api/auth/github",
    sameSite: "Lax",
    secure: redirectUri.startsWith("https://"),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });

  return context.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

authGitHubRoutes.get("/github/callback", async (context) => {
  const { webUrl } = getGitHubOAuthConfig();
  const error = context.req.query("error");
  if (error) {
    return context.redirect(`${webUrl}/login?error=${encodeURIComponent(error)}`);
  }

  const code = context.req.query("code");

  if (code) {
    const { clientId, clientSecret, redirectUri } = getGitHubOAuthConfig();
    const state = context.req.query("state");

    if (!clientId || !clientSecret) {
      throw new ApiError(501, "github_oauth_not_configured", "GitHub OAuth is not configured");
    }

    const storedState = getCookie(context, GITHUB_OAUTH_STATE_COOKIE);
    deleteCookie(context, GITHUB_OAUTH_STATE_COOKIE, {
      path: "/api/auth/github",
    });

    if (!state || !storedState || state !== storedState) {
      throw new ApiError(400, "invalid_state", "Invalid or expired OAuth state");
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("[auth] GitHub token exchange failed:", await tokenResponse.text());
      return context.redirect(`${webUrl}/login?error=token_exchange_failed`);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenData.access_token || tokenData.error) {
      return context.redirect(
        `${webUrl}/login?error=${encodeURIComponent(tokenData.error ?? "token_exchange_failed")}`,
      );
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "Agent-Center",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!userResponse.ok) {
      return context.redirect(`${webUrl}/login?error=userinfo_failed`);
    }

    const userInfo = (await userResponse.json()) as {
      id: number;
      login: string;
      name?: string | null;
      email?: string | null;
      avatar_url?: string;
    };
    const email = userInfo.email ?? (await fetchGitHubEmail(tokenData.access_token));

    if (!email) {
      return context.redirect(`${webUrl}/login?error=email_unavailable`);
    }

    const user = await convexServiceClient.mutation(api.serviceApi.upsertGitHubOAuthUser, {
      email: email.toLowerCase(),
      githubId: String(userInfo.id),
      login: userInfo.login,
      name: userInfo.name ?? userInfo.login,
      avatarUrl: userInfo.avatar_url,
    });

    if (!user) {
      throw new ApiError(500, "user_create_failed", "Failed to create user");
    }

    const sessionToken = `sess_${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    await convexServiceClient.mutation(api.serviceApi.createSession, {
      userId: user.id as Id<"users">,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: expiresAt.getTime(),
    });

    return context.redirect(`${webUrl}/login#token=${encodeURIComponent(sessionToken)}`);
  }

  const status = await githubAppService.getStatus();
  const setupUrl = status.setupUrl;
  const webBase = setupUrl ?? "/";
  const params = new URLSearchParams();

  const installationId = context.req.query("installation_id");
  const setupAction = context.req.query("setup_action");
  const state = context.req.query("state");
  if (installationId) {
    params.set("installation_id", installationId);
  }
  if (setupAction) {
    params.set("setup_action", setupAction);
  }
  if (state) {
    params.set("state", state);
  }

  const separator = webBase.includes("?") ? "&" : "?";
  return context.redirect(params.size > 0 ? `${webBase}${separator}${params}` : webBase);
});
