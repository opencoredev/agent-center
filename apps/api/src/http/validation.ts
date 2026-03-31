import type { Context } from "hono";
import { z } from "zod";

import { ApiError } from "./errors";
import type { ApiEnv } from "./types";

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.join(".") : null,
  }));
}

function hasJsonBody(context: Context<ApiEnv>) {
  const contentType = context.req.header("content-type")?.toLowerCase() ?? "";
  const contentLength = context.req.header("content-length");

  return contentType.includes("application/json") && contentLength !== "0";
}

function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  code: string,
  message: string,
) {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new ApiError(400, code, message, {
      issues: formatIssues(parsed.error.issues),
    });
  }

  return parsed.data;
}

export async function validateJson<TSchema extends z.ZodTypeAny>(
  context: Context<ApiEnv>,
  schema: TSchema,
  options?: {
    optionalBody?: boolean;
  },
) {
  let payload: unknown = {};

  if (hasJsonBody(context)) {
    try {
      payload = await context.req.json();
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
    }
  } else if (!options?.optionalBody) {
    throw new ApiError(400, "missing_json_body", "Request body must be JSON");
  }

  return parseWithSchema(schema, payload, "invalid_request_body", "Request body validation failed");
}

export function validateParams<TSchema extends z.ZodTypeAny>(
  context: Context<ApiEnv>,
  schema: TSchema,
) {
  return parseWithSchema(
    schema,
    context.req.param(),
    "invalid_path_parameters",
    "Path parameter validation failed",
  );
}

export function validateQuery<TSchema extends z.ZodTypeAny>(
  context: Context<ApiEnv>,
  schema: TSchema,
) {
  return parseWithSchema(
    schema,
    context.req.query(),
    "invalid_query_parameters",
    "Query parameter validation failed",
  );
}
