import { runnerRuntimeEnv } from "../env";

export class InternalApiError extends Error {
  readonly body: string | null;
  readonly status: number;
  readonly url: string;

  constructor(message: string, options: { body?: string | null; status: number; url: string }) {
    super(message);
    this.name = "InternalApiError";
    this.body = options.body ?? null;
    this.status = options.status;
    this.url = options.url;
  }
}

export class InternalApiAuthError extends InternalApiError {
  constructor(message: string, options: { body?: string | null; status: number; url: string }) {
    super(message, options);
    this.name = "InternalApiAuthError";
  }
}

export type InternalApiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface InternalApiRequestOptions {
  baseUrl?: string;
  fetchImpl?: InternalApiFetch;
  token?: string;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function buildInternalApiUrl(path: string, baseUrl = runnerRuntimeEnv.RUNNER_API_URL) {
  return new URL(path, normalizeBaseUrl(baseUrl)).toString();
}

type InternalApiHeadersInit = ConstructorParameters<typeof Headers>[0];

export function buildInternalApiHeaders(
  headers: InternalApiHeadersInit | undefined,
  token = runnerRuntimeEnv.RUNNER_API_TOKEN,
) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("accept", "application/json");

  const trimmedToken = token.trim();
  if (trimmedToken) {
    nextHeaders.set("authorization", `Bearer ${trimmedToken}`);
  }

  return nextHeaders;
}

async function readResponseBody(response: Response) {
  const body = await response.text();
  return body.trim().length > 0 ? body : null;
}

export async function fetchInternalApiJson<T>(
  path: string,
  init: RequestInit = {},
  options: InternalApiRequestOptions = {},
): Promise<T> {
  const url = buildInternalApiUrl(path, options.baseUrl);
  const response = await (options.fetchImpl ?? fetch)(url, {
    ...init,
    headers: buildInternalApiHeaders(init.headers, options.token),
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    const message = body ?? `${response.status} ${response.statusText}`;
    const error =
      response.status === 401 || response.status === 403
        ? new InternalApiAuthError(message, { body, status: response.status, url })
        : new InternalApiError(message, { body, status: response.status, url });
    throw error;
  }

  const body = await readResponseBody(response);
  if (!body) {
    throw new InternalApiError(`Internal API response from ${url} was empty`, {
      status: response.status,
      url,
    });
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new InternalApiError(`Internal API response from ${url} was not valid JSON`, {
      body,
      status: response.status,
      url,
    });
  }
}
