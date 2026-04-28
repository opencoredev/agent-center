import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  LogOut,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AGENTS, MODELS, ProviderLogo, type AgentEntry, type ModelEntry } from "@/lib/agent-models";

interface CredentialStatus {
  connected: boolean;
  source: "api_key" | "oauth" | null;
  email: string | null;
  expiresAt: string | null;
  subscriptionType: string | null;
}

interface ProviderConfig {
  id: "claude" | "openai";
  agentId: string;
  title: string;
  credentialPath: string;
  logoId: AgentEntry["logoId"];
  connectKind: "claude-oauth" | "codex-auth";
  description: string;
  connectedDescription: string;
  connectLabel: string;
}

const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const CLAUDE_AUTH_URL = "https://claude.ai/oauth/authorize";
const CLAUDE_SCOPES = "org:create_api_key user:profile user:inference";

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: "claude",
    agentId: "claude",
    title: "Claude",
    credentialPath: "/api/credentials/claude",
    logoId: "claude",
    connectKind: "claude-oauth",
    description: "Connect your Claude account so Claude Code can run tasks in Agent Center.",
    connectedDescription: "Claude account connected for this workspace.",
    connectLabel: "Connect Claude",
  },
  {
    id: "openai",
    agentId: "codex",
    title: "Codex",
    credentialPath: "/api/credentials/openai",
    logoId: "openai",
    connectKind: "codex-auth",
    description: "Connect your Codex account session so Codex can run tasks in Agent Center.",
    connectedDescription: "Codex account connected for this workspace.",
    connectLabel: "Connect Codex",
  },
];

interface LocalSetupConfig {
  id: "opencode" | "cursor";
  title: string;
  logoId: AgentEntry["logoId"];
  storageKey: string;
  command: string;
  description: string;
  detail: string;
}

const LOCAL_SETUP_CONFIGS: LocalSetupConfig[] = [
  {
    id: "opencode",
    title: "OpenCode",
    logoId: "opencode",
    storageKey: "ac_harness_setup_opencode",
    command: "opencode auth login",
    description: "Device/session setup for the OpenCode harness.",
    detail: "Run the login command in this repo shell, then mark this device ready.",
  },
  {
    id: "cursor",
    title: "Cursor",
    logoId: "cursor",
    storageKey: "ac_harness_setup_cursor",
    command: "cursor-agent login",
    description: "Device/session setup for the Cursor harness.",
    detail:
      "Run the login command in the same environment that launches tasks, then mark this device ready.",
  },
];

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function createCodeChallenge(verifier: string) {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

async function createClaudeAuthorization() {
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = randomBase64Url(24);
  const params = new URLSearchParams({
    code: "true",
    client_id: CLAUDE_CLIENT_ID,
    response_type: "code",
    redirect_uri: CLAUDE_REDIRECT_URI,
    scope: CLAUDE_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  return {
    codeVerifier,
    url: `${CLAUDE_AUTH_URL}?${params.toString()}`,
  };
}

function getCredentialCopy(status: CredentialStatus | undefined) {
  if (!status?.connected) return "Not connected";
  if (status.source === "api_key") return "Legacy connection";
  return "Account connected";
}

function getCredentialDetail(status: CredentialStatus | undefined, fallback: string) {
  if (!status?.connected) return fallback;
  if (status.email) return status.email;
  if (status.subscriptionType) return status.subscriptionType;
  return "Ready to run tasks";
}

function DefaultModelPicker({
  selectedModelId,
  onSelect,
}: {
  selectedModelId: string;
  onSelect: (model: ModelEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const selectableAgents = AGENTS.filter((agent) => !agent.disabled && !agent.comingSoon);

  const selectedModel =
    MODELS.find((m) => m.id === selectedModelId && !m.disabled && !m.comingSoon) ??
    MODELS.find((m) => !m.disabled && !m.comingSoon) ??
    MODELS[0]!;
  const selectedAgent =
    selectableAgents.find((a) => a.id === selectedModel.agentId) ??
    selectableAgents[0] ??
    AGENTS[0]!;

  const activeAgentId = hoveredAgent ?? selectedAgent.id;
  const activeModels = MODELS.filter(
    (m) => m.agentId === activeAgentId && !m.disabled && !m.comingSoon,
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setHoveredAgent(null);
      }}
    >
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
          <ProviderLogo agent={selectedAgent} className="w-4 h-4 text-current" />
          <span className="text-sm font-medium text-foreground">
            {selectedAgent.label}: {selectedModel.label}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 overflow-hidden" sideOffset={4}>
        <div className="flex w-[400px]">
          <div className="w-[150px] shrink-0 border-r border-border/40 py-1 px-1">
            {selectableAgents.map((agent) => {
              const isActive = activeAgentId === agent.id;
              return (
                <button
                  key={agent.id}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isActive ? "bg-accent" : "hover:bg-muted/50"
                  }`}
                >
                  <ProviderLogo agent={agent} className="w-4 h-4 text-current" />
                  <span className="font-medium text-foreground flex-1 text-left truncate">
                    {agent.label}
                  </span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
          <div
            className="flex-1 min-w-0 overflow-y-auto max-h-[300px] py-1 px-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {activeModels.map((model) => {
              const isSelected = model.id === selectedModelId;
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelect(model);
                    setOpen(false);
                    setHoveredAgent(null);
                  }}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                    isSelected ? "bg-accent" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-sm font-medium text-foreground">{model.label}</span>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                      {model.description}
                    </p>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProviderConnectionCard({ config }: { config: ProviderConfig }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [claudeCodeVerifier, setClaudeCodeVerifier] = useState<string | null>(null);
  const [claudeCode, setClaudeCode] = useState("");
  const [showCodexImport, setShowCodexImport] = useState(false);
  const [codexAuthJson, setCodexAuthJson] = useState("");

  const {
    data: credStatus,
    refetch,
    isLoading,
  } = useQuery({
    queryKey: ["credentials", config.id],
    queryFn: () => apiGet<CredentialStatus>(config.credentialPath),
    staleTime: 60_000,
  });

  const exchangeClaudeMutation = useMutation({
    mutationFn: (payload: { code: string; codeVerifier: string }) =>
      apiPost<CredentialStatus>("/api/auth/claude/exchange", payload),
    onSuccess: () => {
      setClaudeCode("");
      setClaudeCodeVerifier(null);
      setError(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["prompt-credentials"] });
    },
    onError: (err: Error) => setError(err.message ?? "Failed to connect Claude"),
  });

  const saveCodexMutation = useMutation({
    mutationFn: (authJson: string) =>
      apiPost<CredentialStatus>("/api/auth/codex/save-auth", { authJson }),
    onSuccess: () => {
      setCodexAuthJson("");
      setShowCodexImport(false);
      setError(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["prompt-credentials"] });
    },
    onError: (err: Error) => setError(err.message ?? "Failed to connect Codex"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiDelete<{ deleted: boolean }>(config.credentialPath),
    onSuccess: () => {
      setError(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["prompt-credentials"] });
    },
    onError: (err: Error) => setError(err.message ?? "Failed to disconnect"),
  });

  const isConnected = credStatus?.connected === true;
  const isMutating =
    exchangeClaudeMutation.isPending || saveCodexMutation.isPending || disconnectMutation.isPending;

  async function startClaudeConnect() {
    try {
      const auth = await createClaudeAuthorization();
      setClaudeCodeVerifier(auth.codeVerifier);
      setError(null);
      const popup = window.open(auth.url, "_blank", "noopener,noreferrer,width=560,height=720");
      if (!popup) {
        setError("Popup blocked. Allow popups for Agent Center, then try Connect Claude again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Claude sign-in");
    }
  }

  return (
    <div className="py-5 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-4">
        <ProviderLogo logoId={config.logoId} className="w-6 h-6 text-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">{config.title}</h3>
                {!isLoading && isConnected && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-[11px] font-medium text-status-success">
                    <ShieldCheck className="h-3 w-3" />
                    {getCredentialCopy(credStatus)}
                  </span>
                )}
              </div>
              {isLoading ? (
                <div className="h-3 w-32 rounded bg-muted animate-pulse mt-2" />
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  {getCredentialDetail(
                    credStatus,
                    isConnected ? config.connectedDescription : config.description,
                  )}
                </p>
              )}
            </div>
            {isConnected ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={isMutating}
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                Disconnect
              </Button>
            ) : config.connectKind === "claude-oauth" ? (
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void startClaudeConnect()}
                disabled={isMutating}
              >
                {exchangeClaudeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                {config.connectLabel}
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8"
                onClick={() => {
                  setShowCodexImport(true);
                  setError(null);
                }}
                disabled={isMutating}
              >
                {config.connectLabel}
              </Button>
            )}
          </div>

          {config.connectKind === "claude-oauth" && claudeCodeVerifier && !isConnected && (
            <form
              className="mt-4 rounded-lg border border-border/70 bg-muted/20 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const code = claudeCode.trim();
                if (!code || !claudeCodeVerifier) return;
                exchangeClaudeMutation.mutate({ code, codeVerifier: claudeCodeVerifier });
              }}
            >
              <label className="text-xs font-medium text-foreground" htmlFor="claude-oauth-code">
                Paste the Claude authorization code
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="claude-oauth-code"
                  value={claudeCode}
                  onChange={(event) => setClaudeCode(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  placeholder="Returned code from Claude"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9"
                  disabled={!claudeCode.trim() || exchangeClaudeMutation.isPending}
                >
                  {exchangeClaudeMutation.isPending ? "Finishing..." : "Finish"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Claude opens its authorization page in a new window. After approval, paste the
                returned code here.
              </p>
            </form>
          )}

          {config.connectKind === "codex-auth" && showCodexImport && !isConnected && (
            <form
              className="mt-4 rounded-lg border border-border/70 bg-muted/20 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const authJson = codexAuthJson.trim();
                if (!authJson) return;
                saveCodexMutation.mutate(authJson);
              }}
            >
              <label className="text-xs font-medium text-foreground" htmlFor="codex-auth-json">
                Paste your Codex account session
              </label>
              <textarea
                id="codex-auth-json"
                value={codexAuthJson}
                onChange={(event) => setCodexAuthJson(event.target.value)}
                spellCheck={false}
                className="mt-2 min-h-[120px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder='Contents of ~/.codex/auth.json after running "codex login"'
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Run <code className="rounded bg-muted px-1 py-0.5">codex login</code>, then paste
                  the local auth JSON. This uses your account session.
                </p>
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={!codexAuthJson.trim() || saveCodexMutation.isPending}
                >
                  {saveCodexMutation.isPending ? "Connecting..." : "Save session"}
                </Button>
              </div>
            </form>
          )}

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function LocalSetupRow({ config }: { config: LocalSetupConfig }) {
  const [isReady, setIsReady] = useState(() => localStorage.getItem(config.storageKey) === "true");

  const setReady = (nextReady: boolean) => {
    setIsReady(nextReady);
    if (nextReady) {
      localStorage.setItem(config.storageKey, "true");
    } else {
      localStorage.removeItem(config.storageKey);
    }
    window.dispatchEvent(new Event("agent-harness-setup-change"));
  };

  return (
    <div className="py-5 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-4">
        <ProviderLogo logoId={config.logoId} className="w-6 h-6 text-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">{config.title}</h3>
                {isReady && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-[11px] font-medium text-status-success">
                    <ShieldCheck className="h-3 w-3" />
                    Device ready
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-xs text-foreground">
                  {config.command}
                </code>
                <span className="text-[11px] text-muted-foreground">{config.detail}</span>
              </div>
            </div>
            <Button
              variant={isReady ? "ghost" : "outline"}
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => setReady(!isReady)}
            >
              {isReady ? (
                <>
                  <LogOut className="h-3.5 w-3.5" />
                  Clear
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Mark ready
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuntimeSetupRow() {
  return (
    <div className="py-5 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-4">
        <ProviderLogo logoId="convex" className="w-6 h-6 text-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Convex Runtime</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Terminal className="h-3 w-3" />
              Repo setup
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Log in to Convex from this repo, then configure the deployment/runtime for task
            launches.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-xs text-foreground">
              bunx convex dev
            </code>
            <code className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-xs text-foreground">
              bunx convex login
            </code>
            <span className="text-[11px] text-muted-foreground">
              Use the repo convention before selecting a managed runtime.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelsPage() {
  const [defaultModelId, setDefaultModelId] = useState("claude-opus-4-6");

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Models</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage model defaults and account connections.
        </p>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Default Agent</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose the default agent and model used for tasks.
            </p>
          </div>
          <DefaultModelPicker
            selectedModelId={defaultModelId}
            onSelect={(m) => setDefaultModelId(m.id)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-foreground mb-1">Account Connections</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Connect or set up harness accounts to enable model choices for task runs.
        </p>
        <div className="rounded-lg border border-border bg-card px-4">
          {PROVIDER_CONFIGS.map((config) => (
            <ProviderConnectionCard key={config.id} config={config} />
          ))}
          {LOCAL_SETUP_CONFIGS.map((config) => (
            <LocalSetupRow key={config.id} config={config} />
          ))}
          <RuntimeSetupRow />
        </div>
      </section>
    </div>
  );
}
