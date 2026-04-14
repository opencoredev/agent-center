import {
  AgentCenterApiError,
  AgentCenterProtocolError,
  AgentCenterTransportError,
} from "./errors.js";
import type {
  AgentCenterClientOptions,
  ErrorEnvelope,
  RequestOptions,
  SuccessEnvelope,
} from "./types.js";

interface RequestConfig extends RequestOptions {
  body?: unknown;
  method: "DELETE" | "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, boolean | number | string | undefined>;
}

export class AgentCenterHttpClient {
  readonly apiBaseUrl: string;
  readonly realtimeUrl: string;

  private readonly defaultHeaders: HeadersInit | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AgentCenterClientOptions) {
    this.apiBaseUrl = resolveApiBaseUrl(options.baseUrl, options.apiBasePath ?? "/api");
    this.realtimeUrl = resolveRealtimeUrl(options.baseUrl, options.realtimePath ?? "/ws");
    this.defaultHeaders = options.headers;
    this.fetchImpl = options.fetch ?? getDefaultFetch();
  }

  async request<TResponse>(config: RequestConfig): Promise<TResponse> {
    const url = new URL(config.path.replace(/^\//u, ""), withTrailingSlash(this.apiBaseUrl));

    appendQuery(url, config.query);

    const headers = new Headers(this.defaultHeaders);

    if (config.headers !== undefined) {
      const requestHeaders = new Headers(config.headers);

      for (const [key, value] of requestHeaders.entries()) {
        headers.set(key, value);
      }
    }

    let body: string | undefined;

    if (config.body !== undefined) {
      body = JSON.stringify(config.body);

      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        body,
        headers,
        method: config.method,
        signal: config.signal,
      });
    } catch (error) {
      throw new AgentCenterTransportError(`Request failed for ${url.toString()}`, error);
    }

    const requestId = response.headers.get("x-request-id") ?? undefined;
    const payload = await readJsonPayload(response);

    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        throw new AgentCenterApiError(response.status, payload.error.code, payload.error.message, {
          details: payload.error.details,
          requestId: payload.requestId,
        });
      }

      throw new AgentCenterApiError(response.status, "http_error", response.statusText, {
        details: payload,
        requestId,
      });
    }

    if (!isSuccessEnvelope<TResponse>(payload)) {
      throw new AgentCenterProtocolError(
        `Expected a success envelope for ${config.method} ${url.toString()}.`,
      );
    }

    return payload.data;
  }
}

function appendQuery(
  url: URL,
  query: Record<string, boolean | number | string | undefined> | undefined,
) {
  if (query === undefined) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AgentCenterProtocolError("Expected the API response body to contain valid JSON.");
  }
}

function getDefaultFetch(): typeof fetch {
  if (typeof globalThis.fetch !== "function") {
    throw new AgentCenterTransportError(
      "No global fetch implementation was found. Pass a fetch implementation in the client options.",
    );
  }

  return globalThis.fetch.bind(globalThis);
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveApiBaseUrl(baseUrl: string, apiBasePath: string): string {
  return new URL(stripLeadingSlash(apiBasePath), withTrailingSlash(baseUrl)).toString();
}

function resolveRealtimeUrl(baseUrl: string, realtimePath: string): string {
  const url = new URL(stripLeadingSlash(realtimePath), withTrailingSlash(baseUrl));

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }

  return url.toString();
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/u, "");
}

function isSuccessEnvelope<TData>(value: unknown): value is SuccessEnvelope<TData> {
  return isRecord(value) && "data" in value && typeof value.requestId === "string";
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    typeof value.requestId === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
