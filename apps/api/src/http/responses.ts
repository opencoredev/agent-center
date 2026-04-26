import type { Context } from "hono";

import { ApiError } from "./errors";
import type { ApiEnv, ErrorEnvelope, SuccessEnvelope } from "./types";

type ApiSuccessStatus = 200 | 201 | 202;
type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 500 | 501;

export function getRequestId(context: Context<ApiEnv>) {
  return context.get("requestId");
}

export function ok<TData>(context: Context<ApiEnv>, data: TData, status: ApiSuccessStatus = 200) {
  return context.json(
    {
      data,
      requestId: getRequestId(context),
    } satisfies SuccessEnvelope<TData>,
    status,
  );
}

export function errorResponse(
  context: Context<ApiEnv>,
  error: ApiError,
  fallbackRequestId?: string,
) {
  const requestId = fallbackRequestId ?? context.get("requestId") ?? crypto.randomUUID();

  const body: ErrorEnvelope = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    requestId,
  };

  context.header("x-request-id", requestId);

  return context.json(body, error.status as ApiErrorStatus);
}
