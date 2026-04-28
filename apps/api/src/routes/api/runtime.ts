import { Hono } from "hono";

import type { RuntimeProvider, RuntimeTarget } from "@agent-center/shared";

import type { ApiEnv } from "../../http/types";
import { ok } from "../../http/responses";

type RuntimeTemplate = {
  id: string;
  label: string;
  agentProvider: "claude" | "codex" | "opencode" | "cursor";
  requiredCredential: "anthropic" | "openai" | "provider";
};

type RuntimeProviderStatus = {
  id: RuntimeProvider;
  label: string;
  target: RuntimeTarget;
  configured: boolean;
  launchReady: boolean;
  launchBlockReason: string;
  templates: RuntimeTemplate[];
  billingNote: string;
};

const e2bTemplates = [
  {
    id: "claude",
    label: "Claude Code",
    agentProvider: "claude",
    requiredCredential: "anthropic",
  },
  {
    id: "codex",
    label: "Codex",
    agentProvider: "codex",
    requiredCredential: "openai",
  },
  {
    id: "opencode",
    label: "OpenCode",
    agentProvider: "opencode",
    requiredCredential: "provider",
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    agentProvider: "cursor",
    requiredCredential: "provider",
  },
] satisfies RuntimeTemplate[];

function hasConfiguredSecret(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export const runtimeRoutes = new Hono<ApiEnv>();

runtimeRoutes.get("/providers", (context) => {
  const providers = [
    {
      id: "e2b",
      label: "E2B",
      target: "cloud",
      configured: hasConfiguredSecret(process.env.E2B_API_KEY),
      launchReady: false,
      launchBlockReason:
        "E2B is configured as a cloud runtime capability, but agent run launch is intentionally disabled until repo checkout and runner execution are wired end to end.",
      templates: e2bTemplates,
      billingNote:
        "Reading this status does not create a sandbox. E2B billing starts only when a sandbox is explicitly created for a run.",
    },
  ] satisfies RuntimeProviderStatus[];

  return ok(context, {
    providers,
    hostedUiPolicy: {
      productionHiddenProviders: ["legacy_local", "self_hosted_runner"] satisfies RuntimeProvider[],
      note: "Hosted production UI should hide local and self-hosted runtime choices unless an instance explicitly opts into them.",
    },
  });
});
