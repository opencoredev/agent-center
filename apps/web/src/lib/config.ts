/**
 * Runtime configuration for the frontend.
 *
 * API URL resolution priority:
 * 1. localStorage override (hybrid mode — user connects to their own API)
 * 2. Build-time VITE_API_URL (cloud mode — baked in at deploy)
 * 3. Same origin (self-hosted — API serves the frontend)
 */

const API_URL_KEY = "agent_center_api_url";

export function getApiUrl(): string {
  return (
    localStorage.getItem(API_URL_KEY) ||
    import.meta.env.VITE_API_URL ||
    window.location.origin
  );
}

export function getWsUrl(): string {
  return getApiUrl().replace(/^http/, "ws") + "/ws";
}

export function setApiUrl(url: string) {
  localStorage.setItem(API_URL_KEY, url);
}

export function clearApiUrl() {
  localStorage.removeItem(API_URL_KEY);
}
