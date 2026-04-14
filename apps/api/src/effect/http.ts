import type { Context } from "hono";
import { Cause, Effect, Exit } from "effect";

import { normalizeError } from "../http/errors";
import { errorResponse, ok } from "../http/responses";
import type { ApiEnv } from "../http/types";

type ApiSuccessStatus = 200 | 201 | 202;

export async function runApiEffect<TData>(
  context: Context<ApiEnv>,
  effect: Effect.Effect<TData, unknown>,
  status: ApiSuccessStatus = 200,
) {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return ok(context, exit.value, status);
  }

  return errorResponse(context, normalizeError(Cause.squash(exit.cause)));
}

export async function runApiResponseEffect(
  context: Context<ApiEnv>,
  effect: Effect.Effect<Response, unknown>,
) {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  return errorResponse(context, normalizeError(Cause.squash(exit.cause)));
}

export function tryApiPromise<TData>(work: () => Promise<TData>) {
  return Effect.tryPromise({
    try: work,
    catch: (error) => error,
  });
}
