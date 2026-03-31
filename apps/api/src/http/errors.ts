interface DatabaseErrorLike {
  code?: string;
  constraint_name?: string;
  detail?: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isDatabaseErrorLike(error: unknown): error is DatabaseErrorLike {
  return typeof error === "object" && error !== null && "message" in error;
}

export function notFoundError(resource: string, id: string) {
  return new ApiError(404, `${resource}_not_found`, `${resource} not found`, {
    id,
  });
}

export function conflictError(message: string, details?: unknown) {
  return new ApiError(409, "conflict", message, details);
}

export function badRequestError(message: string, details?: unknown) {
  return new ApiError(400, "bad_request", message, details);
}

export function normalizeError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (isDatabaseErrorLike(error)) {
    if (error.code === "23505") {
      return new ApiError(409, "resource_conflict", "Resource already exists", {
        constraint: error.constraint_name,
        detail: error.detail,
      });
    }

    if (error.code === "23503") {
      return new ApiError(409, "invalid_reference", "Referenced resource does not exist", {
        constraint: error.constraint_name,
        detail: error.detail,
      });
    }

    if (error.code === "23514") {
      return new ApiError(400, "constraint_violation", "Request violates a database constraint", {
        constraint: error.constraint_name,
        detail: error.detail,
      });
    }
  }

  return new ApiError(500, "internal_server_error", "Internal Server Error");
}
