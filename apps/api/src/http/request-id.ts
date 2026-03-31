import type { MiddlewareHandler } from "hono";

import type { ApiEnv } from "./types";

export const REQUEST_ID_HEADER = "x-request-id";

export const requestIdMiddleware: MiddlewareHandler<ApiEnv> = async (context, next) => {
  const requestId = context.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID();

  context.set("requestId", requestId);

  try {
    await next();
  } finally {
    context.header(REQUEST_ID_HEADER, requestId);
  }
};
