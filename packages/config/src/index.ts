import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

export const nodeEnv = z.enum(["development", "test", "production"]).default("development");

export const logLevel = z.enum(["debug", "info", "warn", "error"]).default("info");

export const host = z.string().min(1);

export const port = z.coerce.number().int().min(1).max(65535);

const rootEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));

export function loadRootEnv() {
  dotenv.config({
    path: rootEnvPath,
    quiet: true,
  });
}

export function parseEnv<TSchema extends z.ZodRawShape>(
  input: Record<string, string | undefined>,
  schema: { [Key in keyof TSchema]: TSchema[Key] },
) {
  return z.object(schema).parse(input);
}
