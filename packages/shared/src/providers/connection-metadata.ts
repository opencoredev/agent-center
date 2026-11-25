const SECRET_KEYS = new Set(["accessToken", "pat", "personalAccessToken", "token"]);
const URL_KEYS = new Set(["apiBaseUrl", "baseUrl"]);

function withoutUserinfo(value: string) {
  try {
    const url = new URL(value);
    if (!url.username && !url.password) return value;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value.replace(/\/\/[^/@\s]*@/, "//");
  }
}

/**
 * Connection metadata as it may be shown to a client: stored tokens removed, and
 * credentials stripped from the host URLs the GitHub provider reads.
 */
export function toPublicConnectionMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !SECRET_KEYS.has(key))
      .map(([key, value]) => [
        key,
        URL_KEYS.has(key) && typeof value === "string" ? withoutUserinfo(value) : value,
      ]),
  );
}
