import { afterEach, describe, expect, test } from "bun:test";

import { runtimeRoutes } from "../routes/api/runtime";

const originalE2bApiKey = process.env.E2B_API_KEY;

type RuntimeProvidersResponse = {
  data: {
    providers: Array<{
      id: string;
      configured: boolean;
      launchReady: boolean;
      templates: Array<{ id: string }>;
    }>;
  };
};

afterEach(() => {
  if (originalE2bApiKey === undefined) {
    delete process.env.E2B_API_KEY;
  } else {
    process.env.E2B_API_KEY = originalE2bApiKey;
  }
});

describe("runtime routes", () => {
  test("reports E2B as configured without returning the secret or enabling launch", async () => {
    process.env.E2B_API_KEY = "e2b_test_secret";

    const response = await runtimeRoutes.request("http://localhost/providers");
    const body = (await response.json()) as RuntimeProvidersResponse;

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("e2b_test_secret");
    expect(body.data.providers).toEqual([
      expect.objectContaining({
        id: "e2b",
        configured: true,
        launchReady: false,
      }),
    ]);
    const [provider] = body.data.providers;
    expect(provider?.templates.map((template) => template.id)).toEqual([
      "claude",
      "codex",
      "opencode",
      "cursor",
    ]);
  });

  test("reports E2B as unconfigured when the secret is absent", async () => {
    delete process.env.E2B_API_KEY;

    const response = await runtimeRoutes.request("http://localhost/providers");
    const body = (await response.json()) as RuntimeProvidersResponse;

    expect(response.status).toBe(200);
    expect(body.data.providers[0]).toEqual(
      expect.objectContaining({
        id: "e2b",
        configured: false,
        launchReady: false,
      }),
    );
  });
});
