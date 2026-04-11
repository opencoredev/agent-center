import { Cause, Effect, Exit } from "effect";

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

  throw new Error(`${context} failed`);
}
