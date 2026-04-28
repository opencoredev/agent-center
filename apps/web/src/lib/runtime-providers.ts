import { apiGet } from "@/lib/api-client";

export type RuntimeProviderId =
  | "legacy_local"
  | "convex_bash"
  | "agent_os"
  | "e2b"
  | "self_hosted_runner";

export type RuntimeProviderTemplate = {
  id: string;
  label: string;
  agentProvider: "claude" | "codex" | "opencode" | "cursor";
  requiredCredential: "claude" | "anthropic" | "codex" | "openai" | "provider";
};

export type RuntimeProviderStatus = {
  id: RuntimeProviderId;
  label: string;
  target: "local" | "cloud" | "self_hosted";
  configured: boolean;
  launchReady: boolean;
  launchBlockReason: string;
  templates: RuntimeProviderTemplate[];
  billingNote: string;
};

export type RuntimeProviderStatusResponse = {
  providers: RuntimeProviderStatus[];
  hostedUiPolicy: {
    productionHiddenProviders: RuntimeProviderId[];
    note: string;
  };
};

export function getRuntimeProviderStatus() {
  return apiGet<RuntimeProviderStatusResponse>("/api/runtime/providers");
}
