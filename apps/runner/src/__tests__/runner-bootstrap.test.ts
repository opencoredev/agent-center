import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { runnerRuntimeEnv } from "../env";
import { bootstrapRunnerAuth } from "../lib/runner-bootstrap";
import type { InternalApiFetch } from "../lib/internal-api";

const tempDirs: string[] = [];
const initialRunnerApiToken = runnerRuntimeEnv.RUNNER_API_TOKEN;
const initialProcessRunnerApiToken = process.env.RUNNER_API_TOKEN;

async function createTempStatePath(name: string) {
  const directory = await mkdtemp(join(tmpdir(), "runner-bootstrap-"));
  tempDirs.push(directory);
  return join(directory, name);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );

  runnerRuntimeEnv.RUNNER_API_TOKEN = initialRunnerApiToken;
  if (initialProcessRunnerApiToken === undefined) {
    delete process.env.RUNNER_API_TOKEN;
  } else {
    process.env.RUNNER_API_TOKEN = initialProcessRunnerApiToken;
  }
});

describe("runner-bootstrap", () => {
  test("prefers RUNNER_API_TOKEN over persisted state and registration", async () => {
    const statePath = await createTempStatePath("runner-state.json");
    let fetchCalled = false;
    const fetchImpl: InternalApiFetch = async () => {
      fetchCalled = true;
      return new Response("unexpected", { status: 500 });
    };

    const result = await bootstrapRunnerAuth({
      envApiToken: "env-runner-token",
      fetchImpl,
      registrationToken: "acr_reg_unused",
      statePath,
    });

    expect(result.source).toBe("env");
    expect(result.token).toBe("env-runner-token");
    expect(fetchCalled).toBe(false);
  });

  test("uses persisted state when env token is absent", async () => {
    const statePath = await createTempStatePath("runner-state.json");
    await Bun.write(
      statePath,
      JSON.stringify({
        apiToken: "persisted-runner-token",
        persistedAt: new Date().toISOString(),
        runner: {
          id: "runner_123",
          workspaceId: "workspace_123",
          name: "Local Runner",
        },
      }),
    );

    const result = await bootstrapRunnerAuth({
      envApiToken: "",
      registrationToken: "acr_reg_unused",
      statePath,
    });

    expect(result.source).toBe("persisted");
    expect(result.token).toBe("persisted-runner-token");
    expect(result.runner).toEqual({
      id: "runner_123",
      workspaceId: "workspace_123",
      name: "Local Runner",
    });
  });

  test("registers with the API and persists the issued auth token", async () => {
    const statePath = await createTempStatePath("runner-state.json");
    const fetchImpl: InternalApiFetch = async (url, init) => {
      expect(url.toString()).toBe("http://api.example.test/api/runners/register");
      expect(init?.method).toBe("POST");
      const headers = init?.headers;
      expect(headers instanceof Headers).toBe(true);

      if (!(headers instanceof Headers)) {
        throw new Error("Expected request headers to be a Headers instance");
      }

      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("content-type")).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify({ registrationToken: "acr_reg_bootstrap" }));

      return new Response(
        JSON.stringify({
          data: {
            authToken: "acr_runner_token",
            runner: {
              id: "runner_456",
              workspaceId: "workspace_456",
              name: "Bootstrap Runner",
            },
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 201,
        },
      );
    };

    const result = await bootstrapRunnerAuth({
      apiUrl: "http://api.example.test",
      envApiToken: "",
      fetchImpl,
      registrationToken: "acr_reg_bootstrap",
      statePath,
    });

    expect(result.source).toBe("registration");
    expect(result.persisted).toBe(true);
    expect(result.token).toBe("acr_runner_token");

    const persistedRaw = await readFile(statePath, "utf8");
    const persisted = JSON.parse(persistedRaw) as {
      apiToken: string;
      runner: { id: string; workspaceId: string; name: string };
    };

    expect(persisted.apiToken).toBe("acr_runner_token");
    expect(persisted.runner).toEqual({
      id: "runner_456",
      workspaceId: "workspace_456",
      name: "Bootstrap Runner",
    });
  });

  test("auto-registers a runner when no token or persisted state exists", async () => {
    const statePath = await createTempStatePath("runner-state.json");
    const calls: string[] = [];
    const fetchImpl: InternalApiFetch = async (url, init) => {
      calls.push(url.toString());

      if (url.toString() === "http://api.example.test/api/runners/registration-tokens") {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            data: {
              registrationToken: "acr_reg_auto",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 201,
          },
        );
      }

      if (url.toString() === "http://api.example.test/api/runners/register") {
        return new Response(
          JSON.stringify({
            data: {
              authToken: "acr_runner_auto",
              runner: {
                id: "runner_auto",
                workspaceId: "workspace_auto",
                name: "Local Runner",
              },
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 201,
          },
        );
      }

      return new Response("unexpected", { status: 500 });
    };

    const { ensureRunnerApiToken } = await import("../lib/runner-bootstrap");

    const result = await ensureRunnerApiToken(
      {
        workspaceId: "workspace_auto",
      },
      {
        apiUrl: "http://api.example.test",
        envApiToken: "",
        fetchImpl,
        registrationToken: "",
        statePath,
      },
    );

    expect(result.source).toBe("auto_registration");
    expect(result.token).toBe("acr_runner_auto");
    expect(calls).toEqual([
      "http://api.example.test/api/runners/registration-tokens",
      "http://api.example.test/api/runners/register",
    ]);
  });
});
