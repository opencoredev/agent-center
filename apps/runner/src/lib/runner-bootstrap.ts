import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { runnerRuntimeEnv } from "../env";
import { fetchInternalApiJson, type InternalApiFetch } from "./internal-api";

interface RunnerRecord {
  id: string;
  workspaceId: string;
  name: string;
}

interface RegisterRunnerResponse {
  data: {
    authToken: string;
    runner: RunnerRecord;
  };
}

interface CreateRunnerRegistrationTokenResponse {
  data: {
    registrationToken: string;
  };
}

interface PersistedRunnerState {
  apiToken: string;
  persistedAt: string;
  runner: RunnerRecord | null;
}

interface BootstrapLogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

export interface BootstrapRunnerAuthOptions {
  apiUrl?: string;
  bootstrapToken?: string;
  envApiToken?: string;
  fetchImpl?: InternalApiFetch;
  logger?: BootstrapLogger;
  registrationToken?: string;
  statePath?: string;
}

export interface BootstrapRunnerAuthResult {
  persisted: boolean;
  runner: RunnerRecord | null;
  source: "env" | "persisted" | "registration" | "auto_registration" | "none";
  statePath: string;
  token: string;
}

function trimToken(value: string | undefined) {
  return value?.trim() ?? "";
}

async function readPersistedRunnerState(
  statePath: string,
  logger: BootstrapLogger,
): Promise<PersistedRunnerState | null> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedRunnerState>;

    if (typeof parsed.apiToken !== "string" || parsed.apiToken.trim().length === 0) {
      logger.warn(`[runner] ignoring auth state at ${statePath} because it does not contain an apiToken`);
      return null;
    }

    return {
      apiToken: parsed.apiToken.trim(),
      persistedAt: typeof parsed.persistedAt === "string" ? parsed.persistedAt : new Date().toISOString(),
      runner:
        parsed.runner &&
        typeof parsed.runner.id === "string" &&
        typeof parsed.runner.workspaceId === "string" &&
        typeof parsed.runner.name === "string"
          ? parsed.runner
          : null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    logger.warn(`[runner] ignoring unreadable auth state at ${statePath}`, error);
    return null;
  }
}

async function persistRunnerState(statePath: string, state: PersistedRunnerState) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function registerRunner(input: {
  apiUrl: string;
  fetchImpl?: InternalApiFetch;
  registrationToken: string;
}) {
  const response = await fetchInternalApiJson<RegisterRunnerResponse>(
    "/api/runners/register",
    {
      body: JSON.stringify({ registrationToken: input.registrationToken }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
    {
      baseUrl: input.apiUrl,
      fetchImpl: input.fetchImpl,
      token: "",
    },
  );

  return response.data;
}

async function createRegistrationToken(input: {
  apiUrl: string;
  bootstrapToken: string;
  fetchImpl?: InternalApiFetch;
  runnerName: string;
  workspaceId: string;
}) {
  const response = await fetchInternalApiJson<CreateRunnerRegistrationTokenResponse>(
    "/api/runners/registration-tokens",
    {
      body: JSON.stringify({
        workspaceId: input.workspaceId,
        name: input.runnerName,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
    {
      baseUrl: input.apiUrl,
      fetchImpl: input.fetchImpl,
      token: input.bootstrapToken,
    },
  );

  return response.data.registrationToken;
}

function applyRunnerApiToken(token: string) {
  runnerRuntimeEnv.RUNNER_API_TOKEN = token;
  process.env.RUNNER_API_TOKEN = token;
}

function clearRunnerApiToken() {
  runnerRuntimeEnv.RUNNER_API_TOKEN = "";
  delete process.env.RUNNER_API_TOKEN;
}

export async function bootstrapRunnerAuth(
  options: BootstrapRunnerAuthOptions = {},
): Promise<BootstrapRunnerAuthResult> {
  const logger = options.logger ?? console;
  const statePath = options.statePath ?? runnerRuntimeEnv.RUNNER_STATE_PATH;
  const apiUrl = options.apiUrl ?? runnerRuntimeEnv.RUNNER_API_URL;
  const bootstrapToken = trimToken(options.bootstrapToken ?? runnerRuntimeEnv.RUNNER_BOOTSTRAP_TOKEN);
  const envApiToken = trimToken(options.envApiToken ?? runnerRuntimeEnv.RUNNER_API_TOKEN);

  if (envApiToken) {
    applyRunnerApiToken(envApiToken);
    return {
      persisted: false,
      runner: null,
      source: "env",
      statePath,
      token: envApiToken,
    };
  }

  const persistedState = await readPersistedRunnerState(statePath, logger);
  if (persistedState) {
    applyRunnerApiToken(persistedState.apiToken);
    return {
      persisted: false,
      runner: persistedState.runner,
      source: "persisted",
      statePath,
      token: persistedState.apiToken,
    };
  }

  const registrationToken = trimToken(
    options.registrationToken ?? runnerRuntimeEnv.RUNNER_REGISTRATION_TOKEN,
  );

  if (!registrationToken) {
    clearRunnerApiToken();
    return {
      persisted: false,
      runner: null,
      source: "none",
      statePath,
      token: "",
    };
  }

  const registration = await registerRunner({
    apiUrl,
    fetchImpl: options.fetchImpl,
    registrationToken,
  });

  await persistRunnerState(statePath, {
    apiToken: registration.authToken,
    persistedAt: new Date().toISOString(),
    runner: registration.runner,
  });

  applyRunnerApiToken(registration.authToken);

  return {
    persisted: true,
    runner: registration.runner,
    source: "registration",
    statePath,
    token: registration.authToken,
  };
}

export async function ensureRunnerApiToken(
  input: {
    workspaceId: string;
    runnerName?: string;
  },
  options: BootstrapRunnerAuthOptions = {},
): Promise<BootstrapRunnerAuthResult> {
  const initial = await bootstrapRunnerAuth(options);

  if (initial.token) {
    return initial;
  }

  const logger = options.logger ?? console;
  const statePath = options.statePath ?? runnerRuntimeEnv.RUNNER_STATE_PATH;
  const apiUrl = options.apiUrl ?? runnerRuntimeEnv.RUNNER_API_URL;
  const bootstrapToken = trimToken(options.bootstrapToken ?? runnerRuntimeEnv.RUNNER_BOOTSTRAP_TOKEN);

  try {
    if (!bootstrapToken) {
      return initial;
    }

    const registrationToken = await createRegistrationToken({
      apiUrl,
      bootstrapToken,
      fetchImpl: options.fetchImpl,
      runnerName: input.runnerName ?? "Local Runner",
      workspaceId: input.workspaceId,
    });

    const registration = await registerRunner({
      apiUrl,
      fetchImpl: options.fetchImpl,
      registrationToken,
    });

    await persistRunnerState(statePath, {
      apiToken: registration.authToken,
      persistedAt: new Date().toISOString(),
      runner: registration.runner,
    });

    applyRunnerApiToken(registration.authToken);

    return {
      persisted: true,
      runner: registration.runner,
      source: "auto_registration",
      statePath,
      token: registration.authToken,
    };
  } catch (error) {
    logger.warn("[runner] automatic runner registration failed", error);
    clearRunnerApiToken();
    return initial;
  }
}
