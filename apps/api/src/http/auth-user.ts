import type { Context } from "hono";

import type { ApiEnv } from "./types";

const LOCAL_DEV_USER_ID = "local-dev-user";

export function isDevelopmentAuthDisabled() {
  return process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";
}

export function getLocalBasicAuthUserId(username: string) {
  return `local-basic:${username}`;
}

export function getCredentialUserId(context: Context<ApiEnv>): string | null {
  return context.get("userId") ?? (isDevelopmentAuthDisabled() ? LOCAL_DEV_USER_ID : null);
}
