import { AgentCenterApiError, AgentCenterHttpClient } from "@agent-center/sdk-ts";
import { getToken } from "./auth";
import { getApiUrl } from "./config";

function createHttpClient() {
  return new AgentCenterHttpClient({
    baseUrl: getApiUrl(),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = getToken();
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      return fetch(input, {
        ...init,
        headers,
      });
    }) as typeof fetch,
  });
}

function normalizeSdkPath(path: string) {
  return path.replace(/^\/api(?=\/|$)/u, "") || "/";
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers,
  });
}

function formatApiError(error: AgentCenterApiError) {
  if (error.status === 401) {
    return "Your session expired. Sign in again to continue.";
  }

  if (error.code === "project_not_found") {
    return "The selected repository points to a project that no longer exists. Reconnect it in Settings -> Repositories.";
  }

  if (error.code === "repo_connection_not_found") {
    return "The selected repository no longer exists. Pick another repository or reconnect it in Settings -> Repositories.";
  }

  if (error.code === "repo_connection_project_mismatch") {
    return "This repository is attached to a different project. Reconnect it in Settings -> Repositories.";
  }

  return error.message;
}

function normalizeClientError(error: unknown) {
  if (error instanceof AgentCenterApiError) {
    if (error.status === 401) {
      window.location.href = "/login";
    }
    return new Error(formatApiError(error));
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Request failed. Try again.");
}

export async function apiGet<T>(path: string): Promise<T> {
  try {
    return await createHttpClient().request<T>({
      method: "GET",
      path: normalizeSdkPath(path),
    });
  } catch (error) {
    throw normalizeClientError(error);
  }
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  try {
    return await createHttpClient().request<T>({
      method: "POST",
      path: normalizeSdkPath(path),
      body,
    });
  } catch (error) {
    throw normalizeClientError(error);
  }
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  try {
    return await createHttpClient().request<T>({
      method: "PATCH",
      path: normalizeSdkPath(path),
      body,
    });
  } catch (error) {
    throw normalizeClientError(error);
  }
}

export async function apiDelete<T>(path: string): Promise<T> {
  try {
    return await createHttpClient().request<T>({
      method: "DELETE",
      path: normalizeSdkPath(path),
    });
  } catch (error) {
    throw normalizeClientError(error);
  }
}
