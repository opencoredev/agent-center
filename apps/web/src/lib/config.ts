/**
 * Runtime configuration for the frontend.
 *
 * API URL resolution priority:
 * 1. localStorage override (hybrid mode — user connects to their own API)
 * 2. Build-time VITE_API_URL (cloud mode — baked in at deploy)
 * 3. Same origin (self-hosted — API serves the frontend)
 */

const API_URL_KEY = "agent_center_api_url";

function normalizeApiUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return null;

  const trimmed = rawUrl.trim().replace(/\/+$/u, "");
  if (!trimmed) return null;

  return trimmed.replace(/\/api$/u, "");
}

export function getApiUrl(): string {
  const stored = normalizeApiUrl(localStorage.getItem(API_URL_KEY));
  if (stored) {
    return stored;
  }

  return normalizeApiUrl(import.meta.env.VITE_API_URL) || window.location.origin;
}

export function getWsUrl(): string {
  return getApiUrl().replace(/^http/, "ws") + "/ws";
}

export function setApiUrl(url: string) {
  const normalized = normalizeApiUrl(url);
  if (!normalized) {
    localStorage.removeItem(API_URL_KEY);
    return;
  }

  localStorage.setItem(API_URL_KEY, normalized);
}

export function clearApiUrl() {
  localStorage.removeItem(API_URL_KEY);
}

export function getZeroCacheUrl(): string | undefined {
  return import.meta.env.VITE_ZERO_CACHE_URL || undefined;
}
