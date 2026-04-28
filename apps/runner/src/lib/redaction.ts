const REDACTED = "[REDACTED]";

const TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/gi, `$1${REDACTED}`],
  [/\b(Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/gi, `$1${REDACTED}`],
  [/\b((?:access|refresh|id)_token["'\s:=]+)([A-Za-z0-9._~+/=-]{12,})/gi, `$1${REDACTED}`],
  [
    /\b((?:api[_-]?key|token|secret|session|authorization)["'\s:=]+)([A-Za-z0-9._~+/=-]{12,})/gi,
    `$1${REDACTED}`,
  ],
  [/\bsk-[A-Za-z0-9._-]{12,}\b/g, REDACTED],
  [/\bsess_[A-Za-z0-9._-]{12,}\b/g, REDACTED],
  [/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, REDACTED],
];

export function redactString(value: string) {
  return TOKEN_REPLACEMENTS.reduce((current, [pattern, replacement]) => {
    pattern.lastIndex = 0;
    return current.replace(pattern, replacement);
  }, value);
}

function isSensitiveKey(key: string) {
  const normalized = key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();

  return (
    normalized.includes("authorization") ||
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "token" ||
    normalized === "secret" ||
    normalized === "api_key" ||
    normalized === "apikey" ||
    normalized === "id_token" ||
    normalized === "private_key" ||
    normalized === "secret_key" ||
    normalized.endsWith("_token") ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("_api_key") ||
    normalized.endsWith("_private_key") ||
    normalized.endsWith("_secret_key") ||
    normalized.includes("password")
  );
}

export function redactSensitiveData<TValue>(value: TValue, parentKey?: string): TValue {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return (parentKey && isSensitiveKey(parentKey) ? REDACTED : redactString(value)) as TValue;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return (parentKey && isSensitiveKey(parentKey) ? REDACTED : value) as TValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item)) as TValue;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactSensitiveData(item, key),
      ]),
    ) as TValue;
  }

  return value;
}
