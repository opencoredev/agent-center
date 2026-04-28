import { runnerRuntimeEnv } from "../env";

export class InternalApiError extends Error {
  readonly body: string | null;
  readonly code: string | null;
  readonly provider: string | null;
  readonly status: number;
  readonly url: string;

  constructor(
    message: string,
    options: {
      body?: string | null;
      code?: string | null;
      provider?: string | null;
      status: number;
      url: string;
    },
  ) {
    super(message);
    this.name = "InternalApiError";
    this.body = options.body ?? null;
    this.code = options.code ?? null;
    this.provider = options.provider ?? null;
    this.status = options.status;
    this.url = options.url;
  }
}

export class InternalApiAuthError extends InternalApiError {
  constructor(
    message: string,
    options: {
      body?: string | null;
      code?: string | null;
      provider?: string | null;
      status: number;
      url: string;
    },
  ) {
    super(message, options);
    this.name = "InternalApiAuthError";
  }
}

export type InternalApiFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

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

function isCredentialRoute(path: string) {
  return path.startsWith("/internal/credentials/");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseCredentialErrorDetails(body: string | null) {
  if (!body) {
    return {};
  }

  try {
    const parsed = asRecord(JSON.parse(body));
    const error = asRecord(parsed?.error);
    const details = asRecord(error?.details);
    const code = typeof error?.code === "string" ? error.code : null;
    const provider = typeof details?.provider === "string" ? details.provider : null;
    return { code, provider };
  } catch {
    return {};
  }
}

function buildCredentialErrorMessage(status: number, statusText: string, body: string | null) {
  const details = parseCredentialErrorDetails(body);
  const code = details.code ? `, code ${details.code}` : "";
  const provider = details.provider ? `, provider ${details.provider}` : "";
  return {
    ...details,
    message: `Internal credential API request failed (${status} ${statusText}${code}${provider})`,
  };
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
    const credentialError = isCredentialRoute(path)
      ? buildCredentialErrorMessage(response.status, response.statusText, body)
      : null;
    const message = credentialError?.message ?? body ?? `${response.status} ${response.statusText}`;
    const error =
      response.status === 401 || response.status === 403
        ? new InternalApiAuthError(message, {
            body: credentialError ? null : body,
            code: credentialError?.code,
            provider: credentialError?.provider,
            status: response.status,
            url,
          })
        : new InternalApiError(message, {
            body: credentialError ? null : body,
            code: credentialError?.code,
            provider: credentialError?.provider,
            status: response.status,
            url,
          });
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
