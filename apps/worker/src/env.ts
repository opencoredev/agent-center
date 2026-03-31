import os from "node:os";

import { loadRootEnv, logLevel, nodeEnv, parseEnv } from "@agent-center/config";

loadRootEnv();

const baseWorkerEnv = parseEnv(
  {
    NODE_ENV: process.env.NODE_ENV,
    WORKER_LOG_LEVEL: process.env.WORKER_LOG_LEVEL,
  },
  {
    NODE_ENV: nodeEnv,
    WORKER_LOG_LEVEL: logLevel,
  },
);

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  label: string,
) {
  if (value === undefined) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsedValue;
}

function parseUrl(value: string | undefined, fallback: string, label: string) {
  const parsedValue = value ?? fallback;

  try {
    return new URL(parsedValue).toString();
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
}

export const workerEnv = {
  ...baseWorkerEnv,
  WORKER_ID: process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`,
  WORKER_RUN_POLL_MS: parsePositiveInteger(process.env.WORKER_RUN_POLL_MS, 3_000, "WORKER_RUN_POLL_MS"),
  WORKER_RUN_BATCH_SIZE: parsePositiveInteger(
    process.env.WORKER_RUN_BATCH_SIZE,
    5,
    "WORKER_RUN_BATCH_SIZE",
  ),
  WORKER_AUTOMATION_POLL_MS: parsePositiveInteger(
    process.env.WORKER_AUTOMATION_POLL_MS,
    10_000,
    "WORKER_AUTOMATION_POLL_MS",
  ),
  WORKER_AUTOMATION_BATCH_SIZE: parsePositiveInteger(
    process.env.WORKER_AUTOMATION_BATCH_SIZE,
    5,
    "WORKER_AUTOMATION_BATCH_SIZE",
  ),
  RUNNER_INTERNAL_BASE_URL: parseUrl(
    process.env.RUNNER_INTERNAL_BASE_URL,
    "http://127.0.0.1:3002",
    "RUNNER_INTERNAL_BASE_URL",
  ),
  RUNNER_DISPATCH_TIMEOUT_MS: parsePositiveInteger(
    process.env.RUNNER_DISPATCH_TIMEOUT_MS,
    10_000,
    "RUNNER_DISPATCH_TIMEOUT_MS",
  ),
};
