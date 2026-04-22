import { Cause, Effect, Exit } from "effect";

function isErrorLike(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

export async function runEffectOrThrow<TValue, TError>(
  effect: Effect.Effect<TValue, TError>,
  context: string,
) {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const squashed = Cause.squash(exit.cause);

  if (squashed instanceof Error) {
    throw squashed;
  }

  if (isErrorLike(squashed)) {
    throw new Error(squashed.message);
  }

  throw new Error(`${context} failed`);
}
