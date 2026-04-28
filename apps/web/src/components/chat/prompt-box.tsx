import React, { useRef, useState, useCallback, useEffect, useMemo, useDeferredValue } from "react";
import {
  CornerDownLeft,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Square,
  Loader2,
  GitBranch,
  Check,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Settings,
  Cloud,
  Monitor,
  Search,
  Star,
} from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import type { ExecutionRuntime } from "@agent-center/shared";
import { api as controlPlaneApi } from "@agent-center/control-plane/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiGet, apiPost } from "@/lib/api-client";
import {
  AGENTS,
  DEFAULT_MODEL_BY_AGENT,
  DEFAULT_REASONING_EFFORT_BY_AGENT,
  MODELS,
  ProviderLogo,
  type AgentEntry,
  type ModelEntry,
} from "@/lib/agent-models";
import { useControlPlaneEnabled } from "@/contexts/convex-context";
import { getSelfHostedConnectorConfig } from "@/lib/execution-connectors";
import { getRuntimeProviderStatus, type RuntimeProviderStatus } from "@/lib/runtime-providers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type { AgentReasoningEffort } from "@/lib/agent-models";

// ── Types ────────────────────────────────────────────────────────────────────

interface RepoConnection {
  id: string;
  workspaceId: string;
  projectId: string | null;
  provider: string;
  owner: string;
  repo: string;
  defaultBranch: string | null;
}

interface GitHubAppStatus {
  configured: boolean;
  installUrl: string | null;
}

interface GitHubInstallation {
  id: number;
  accountLogin: string;
  repositorySelection: string;
}

interface GitHubInstallationRepository {
  id: number;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
}

interface GitHubInstallationRepositoryPage {
  totalCount: number;
  repositories: GitHubInstallationRepository[];
}

interface SelectableInstallationRepository extends GitHubInstallationRepository {
  installationAccountLogin: string;
  installationId: number;
}

interface AttachedFile {
  id: string;
  attachmentId?: string;
  contentType: string;
  name: string;
  previewUrl?: string;
  status: "uploading" | "uploaded" | "error";
  size: string;
  type: "pdf" | "image" | "file";
  url?: string | null;
}

interface PromptBoxProps {
  onSubmit: (prompt: string, files: AttachedFile[]) => void;
  onQueueSubmit?: (prompt: string, files: AttachedFile[]) => void;
  onSteerSubmit?: (prompt: string, files: AttachedFile[]) => void;
  isStreaming?: boolean;
  isSubmitting?: boolean;
  onStop?: () => void;
  allowInputWhileStreaming?: boolean;
  defaultConfig?: {
    agentModel?: string;
    agentReasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink";
    agentThinkingEnabled?: boolean;
    branch?: string;
    repoConnectionId?: string | null;
    sandboxMode?: SandboxMode;
  };
  onConfigChange?: (config: {
    agentProvider: string;
    agentModel: string;
    agentReasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink";
    agentThinkingEnabled?: boolean;
    branch: string;
    runtime: ExecutionRuntime;
    workspaceId?: string;
    repoConnectionId?: string;
    projectId?: string;
  }) => void;
  placeholder?: string;
  compact?: boolean;
  defaultValue?: string;
  lockConfig?: boolean;
}

interface RuntimeProviderRecord {
  key: string;
  name: string;
  description?: string;
  kind: "lightweight" | "full_sandbox" | "self_hosted";
}

interface CredentialStatus {
  connected: boolean;
  source: "api_key" | "oauth" | null;
  email: string | null;
  expiresAt: string | null;
  subscriptionType: string | null;
}

// ── Repo selector ───────────────────────────────────────────────────────────

function RepoSelector({
  selectedRepoId,
  onSelect,
  disabled = false,
}: {
  selectedRepoId: string | null;
  onSelect: (repo: RepoConnection | null) => void;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/api/workspaces"),
    staleTime: 60_000,
  });
  const workspaceId = workspaces[0]?.id ?? null;
  const { data: rawRepos = [] } = useQuery({
    queryKey: ["repo-connections", workspaceId],
    queryFn: () => apiGet<RepoConnection[]>(`/api/repo-connections?workspaceId=${workspaceId}`),
    staleTime: 60_000,
    enabled: workspaceId !== null,
  });
  const { data: githubAppStatus } = useQuery({
    queryKey: ["github-app-status"],
    queryFn: () => apiGet<GitHubAppStatus>("/api/github/app"),
    staleTime: 60_000,
  });
  const { data: installations = [] } = useQuery({
    queryKey: ["github-installations", workspaceId],
    queryFn: () =>
      apiGet<GitHubInstallation[]>(`/api/github/installations?workspaceId=${workspaceId}`),
    staleTime: 30_000,
    enabled: githubAppStatus?.configured === true && workspaceId !== null,
  });
  const installationRepoQueries = useQueries({
    queries: installations.map((installation) => ({
      queryKey: ["github-installation-repositories", installation.id, workspaceId],
      queryFn: () =>
        apiGet<GitHubInstallationRepositoryPage>(
          `/api/github/installations/${installation.id}/repositories?workspaceId=${workspaceId}`,
        ),
      staleTime: 30_000,
      enabled: githubAppStatus?.configured === true && workspaceId !== null,
    })),
  });

  const connectInstalledRepoMutation = useMutation({
    mutationFn: (input: { installationId: number; repository: GitHubInstallationRepository }) =>
      apiPost<RepoConnection>("/api/repo-connections", {
        workspaceId,
        projectId: null,
        provider: "github",
        owner: input.repository.ownerLogin,
        repo: input.repository.name,
        defaultBranch: input.repository.defaultBranch,
        authType: "github_app_installation",
        connectionMetadata: {
          installationId: input.installationId,
        },
      }),
    onSuccess: (repo: RepoConnection) => {
      void queryClient.invalidateQueries({ queryKey: ["repo-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["repo-connections", workspaceId] });
      onSelect(repo);
      setOpen(false);
    },
  });

  const repos = rawRepos;
  const installationRepos = useMemo<SelectableInstallationRepository[]>(
    () =>
      installations
        .flatMap((installation, index) => {
          const page = installationRepoQueries[index]?.data;
          return (page?.repositories ?? []).map((repository) => ({
            ...repository,
            installationId: installation.id,
            installationAccountLogin: installation.accountLogin,
          }));
        })
        .sort((left, right) => left.fullName.localeCompare(right.fullName)),
    [installationRepoQueries, installations],
  );
  const isLoadingInstallationRepos =
    githubAppStatus?.configured === true &&
    installations.length > 0 &&
    installationRepoQueries.some((query) => query.isLoading);

  const selected = repos.find((r) => r.id === selectedRepoId);
  const displayLabel = selected ? `${selected.owner}/${selected.repo}` : "Select repo";

  type RepoEntry =
    | {
        connectedRepo: RepoConnection;
        fullName: string;
        id: string;
        installationRepo: SelectableInstallationRepository | null;
        status: "connected";
      }
    | {
        connectedRepo: null;
        fullName: string;
        id: string;
        installationRepo: SelectableInstallationRepository;
        status: "available";
      };

  const repoEntries = useMemo(() => {
    const normalizedQuery = deferredSearch.trim().toLowerCase();

    const connectedRepoByKey = new Map<string, RepoConnection>(
      repos.map(
        (repo) => [`${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}`, repo] as const,
      ),
    );
    const installationRepoByKey = new Map<string, SelectableInstallationRepository>(
      installationRepos.map(
        (installationRepo) =>
          [
            `${installationRepo.ownerLogin.toLowerCase()}/${installationRepo.name.toLowerCase()}`,
            installationRepo,
          ] as const,
      ),
    );

    const connectedEntries: RepoEntry[] = repos.map((repo): RepoEntry => {
      const key = `${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}`;
      const installationRepo = installationRepoByKey.get(key) ?? null;

      return {
        connectedRepo: repo,
        fullName: `${repo.owner}/${repo.repo}`,
        id: repo.id,
        installationRepo,
        status: "connected" as const,
      };
    });

    const availableEntries: RepoEntry[] = installationRepos
      .filter((installationRepo) => {
        const key = `${installationRepo.ownerLogin.toLowerCase()}/${installationRepo.name.toLowerCase()}`;
        return !connectedRepoByKey.has(key);
      })
      .map(
        (installationRepo): RepoEntry => ({
          connectedRepo: null,
          fullName: installationRepo.fullName,
          id: `installation:${installationRepo.id}`,
          installationRepo,
          status: "available" as const,
        }),
      );

    const entries = connectedEntries
      .concat(availableEntries)
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    if (!normalizedQuery) {
      return entries;
    }

    return entries.filter((entry) => entry.fullName.toLowerCase().includes(normalizedQuery));
  }, [deferredSearch, installationRepos, repos]);

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors ${
            disabled
              ? "text-muted-foreground/40 cursor-default"
              : selected
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer"
                : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 cursor-pointer"
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline max-w-[180px] truncate">{displayLabel}</span>
          {!disabled && <ChevronDown className="w-3 h-3 opacity-50" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[460px] max-w-[calc(100vw-2rem)] p-2"
        sideOffset={8}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setSearch(event.target.value)
              }
              placeholder="Search owner/repo..."
              className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="max-h-[24rem] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            <div className="space-y-1">
              {repoEntries.length > 0 ? (
                repoEntries.map((entry) => {
                  const connectedRepo = entry.connectedRepo;
                  const isSelected = connectedRepo?.id === selectedRepoId;
                  const installationRepo =
                    entry.status === "available" ? entry.installationRepo : null;

                  return (
                    <button
                      key={entry.id}
                      title={entry.fullName}
                      onClick={() => {
                        if (connectedRepo) {
                          onSelect(connectedRepo);
                          setOpen(false);
                          return;
                        }

                        if (!installationRepo) {
                          return;
                        }

                        void connectInstalledRepoMutation.mutate({
                          installationId: installationRepo.installationId,
                          repository: installationRepo,
                        });
                      }}
                      className={`flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                        isSelected ? "bg-accent" : "hover:bg-muted/50"
                      }`}
                      disabled={connectInstalledRepoMutation.isPending || !workspaces[0]?.id}
                    >
                      <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">{entry.fullName}</span>
                      {connectedRepo && isSelected ? (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <div className="px-2.5 py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    {isLoadingInstallationRepos
                      ? "Loading repositories..."
                      : githubAppStatus?.configured
                        ? "No repositories match your search or installation."
                        : "GitHub App is not configured yet."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-1 border-t border-border/60">
            <button
              onClick={() => {
                setOpen(false);
                navigate({ to: "/settings/repositories" });
              }}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Manage repositories</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Model selector ───────────────────────────────────────────────────────────

function isAgentSelectable(
  agent: AgentEntry,
  credentialStatuses: Record<string, CredentialStatus>,
) {
  if (agent.disabled || agent.comingSoon || !agent.credentialPath) return false;
  return credentialStatuses[agent.id]?.connected === true;
}

function ModelSelector({
  selectedModelId,
  credentialStatuses,
  isCredentialLoading,
  onSelect,
}: {
  selectedModelId: string;
  credentialStatuses: Record<string, CredentialStatus>;
  isCredentialLoading: boolean;
  onSelect: (model: ModelEntry) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [favoriteModelIds, setFavoriteModelIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("ac_favorite_models") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });

  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0]!;
  const selectedAgent = AGENTS.find((agent) => agent.id === selectedModel.agentId) ?? AGENTS[0]!;
  const resolvedActiveAgentId = activeAgentId ?? selectedAgent.id;
  const activeAgent =
    AGENTS.find((agent) => agent.id === resolvedActiveAgentId) ?? selectedAgent ?? AGENTS[0]!;
  const activeAgentConnected = isAgentSelectable(activeAgent, credentialStatuses);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const favorites = MODELS.filter((model) => favoriteModelIds.has(model.id));
  const activeModels = MODELS.filter((model) => model.agentId === activeAgent.id);
  const filteredModels = (
    normalizedSearch
      ? MODELS.filter((model) => {
          const agent = AGENTS.find((entry) => entry.id === model.agentId);
          return [model.label, model.description, model.context, agent?.label]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(normalizedSearch));
        })
      : [...favorites, ...activeModels]
  ).filter((model, index, models) => models.findIndex((entry) => entry.id === model.id) === index);

  const persistFavorites = (nextFavorites: Set<string>) => {
    setFavoriteModelIds(nextFavorites);
    localStorage.setItem("ac_favorite_models", JSON.stringify([...nextFavorites]));
  };

  const toggleFavorite = (modelId: string) => {
    const nextFavorites = new Set(favoriteModelIds);
    if (nextFavorites.has(modelId)) {
      nextFavorites.delete(modelId);
    } else {
      nextFavorites.add(modelId);
    }
    persistFavorites(nextFavorites);
  };

  const connectLabel =
    activeAgent.disabled || activeAgent.comingSoon
      ? "Backend support needed"
      : isCredentialLoading
        ? "Checking connection..."
        : `Connect ${activeAgent.label}`;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setActiveAgentId(null);
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors hover:bg-muted/80 cursor-pointer text-muted-foreground hover:text-foreground">
          <ProviderLogo agent={selectedAgent} className="w-3.5 h-3.5 text-current" />
          <span className="hidden sm:inline">{selectedModel.label}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[560px] max-sm:w-[calc(100vw-2rem)] p-0 overflow-hidden"
        sideOffset={8}
      >
        <div className="flex min-h-[360px] bg-popover">
          <div className="w-14 shrink-0 border-r border-border/50 py-2 px-1.5">
            {AGENTS.map((agent) => {
              const isActive = activeAgent.id === agent.id;
              const isConnected = isAgentSelectable(agent, credentialStatuses);
              return (
                <button
                  key={agent.id}
                  type="button"
                  title={agent.label}
                  onClick={() => setActiveAgentId(agent.id)}
                  className={cn(
                    "relative flex h-11 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                    isActive && "bg-muted text-foreground",
                    !isConnected && !isActive && "opacity-55",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 h-6 w-0.5 rounded-full bg-primary" />
                  )}
                  <ProviderLogo agent={agent} className="h-5 w-5 text-current" />
                </button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-border/50 p-2">
              <div className="flex h-10 items-center gap-2 rounded-md border border-border/70 bg-background/50 px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search models..."
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                className={cn(
                  "max-h-[304px] overflow-y-auto p-2 transition",
                  !activeAgentConnected && !normalizedSearch && "blur-[1.5px]",
                )}
                style={{ scrollbarWidth: "thin" }}
              >
                {filteredModels.map((model, index) => {
                  const agent = AGENTS.find((entry) => entry.id === model.agentId) ?? activeAgent;
                  const agentConnected = isAgentSelectable(agent, credentialStatuses);
                  const isDisabled = model.disabled || model.comingSoon || !agentConnected;
                  const isSelected = model.id === selectedModelId;
                  const isFavorite = favoriteModelIds.has(model.id);
                  const shortcut = index < 9 ? `⌘${index + 1}` : null;

                  return (
                    <button
                      key={model.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        onSelect(model);
                        setOpen(false);
                        setActiveAgentId(null);
                        setSearch("");
                      }}
                      className={cn(
                        "group mb-1 flex min-h-[66px] w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                        isDisabled
                          ? "cursor-not-allowed opacity-55"
                          : "cursor-pointer hover:bg-muted/60",
                        isSelected && !isDisabled && "bg-muted",
                      )}
                    >
                      <span
                        role="button"
                        tabIndex={0}
                        title={isFavorite ? "Remove favorite" : "Add favorite"}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleFavorite(model.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleFavorite(model.id);
                          }
                        }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      >
                        <Star
                          className={cn("h-4 w-4", isFavorite && "fill-current text-primary")}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {model.label}
                          </span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {model.context}
                          </span>
                          {model.comingSoon && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Soon
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <ProviderLogo agent={agent} className="h-3 w-3 text-current" />
                          <span className="truncate">{agent.label}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="truncate">{model.description}</span>
                        </div>
                      </div>
                      {shortcut && (
                        <span className="hidden shrink-0 rounded-md bg-muted px-1.5 py-1 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                          {shortcut}
                        </span>
                      )}
                      {isSelected && !isDisabled && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })}

                {filteredModels.length === 0 && (
                  <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No models match that search.
                  </div>
                )}
              </div>

              {!activeAgentConnected && !normalizedSearch && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover/95 p-4 shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                      <ProviderLogo agent={activeAgent} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{activeAgent.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {activeAgent.disabledReason ??
                          `Connect ${activeAgent.label} before choosing its models.`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={activeAgent.disabled || activeAgent.comingSoon || isCredentialLoading}
                    onClick={() => {
                      if (activeAgent.disabled || activeAgent.comingSoon) return;
                      setOpen(false);
                      navigate({ to: "/settings/models" });
                    }}
                    className={cn(
                      "mt-4 flex h-9 w-full items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
                      activeAgent.disabled || activeAgent.comingSoon || isCredentialLoading
                        ? "cursor-not-allowed bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {connectLabel}
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-border/50 p-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  setActiveAgentId(null);
                  setSearch("");
                  navigate({ to: "/settings/models" });
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Manage models</span>
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getDefaultReasoningEffort(model: ModelEntry) {
  if (!model.reasoningEffortLevels || model.reasoningEffortLevels.length === 0) {
    return undefined;
  }

  return (
    model.reasoningEffortLevels.find((option) => option.isDefault)?.value ??
    DEFAULT_REASONING_EFFORT_BY_AGENT[model.agentId] ??
    model.reasoningEffortLevels[0]?.value
  );
}

function TraitsSelector({
  model,
  reasoningEffort,
  thinkingEnabled,
  onReasoningEffortChange,
  onThinkingEnabledChange,
}: {
  model: ModelEntry;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink";
  thinkingEnabled?: boolean;
  onReasoningEffortChange: (
    value: "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink",
  ) => void;
  onThinkingEnabledChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedEffort = reasoningEffort ?? getDefaultReasoningEffort(model);

  if (
    (!model.reasoningEffortLevels || model.reasoningEffortLevels.length === 0) &&
    !model.supportsThinkingToggle
  ) {
    return null;
  }

  const triggerLabel = model.reasoningEffortLevels?.length
    ? (model.reasoningEffortLevels.find((option) => option.value === selectedEffort)?.label ??
      "Reasoning")
    : thinkingEnabled === false
      ? "Thinking off"
      : "Thinking on";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors hover:bg-muted/80 cursor-pointer text-muted-foreground hover:text-foreground">
          <span className="hidden sm:inline">{triggerLabel}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1" sideOffset={8}>
        {model.reasoningEffortLevels && model.reasoningEffortLevels.length > 0 ? (
          <>
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Reasoning</div>
            {model.reasoningEffortLevels.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onReasoningEffortChange(option.value);
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2.5 w-full px-2.5 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                  selectedEffort === option.value ? "bg-accent" : "hover:bg-muted/50"
                }`}
              >
                <span>
                  {option.label}
                  {option.isDefault ? " (default)" : ""}
                </span>
                {selectedEffort === option.value && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            ))}
          </>
        ) : null}

        {model.supportsThinkingToggle ? (
          <>
            {model.reasoningEffortLevels && model.reasoningEffortLevels.length > 0 ? (
              <div className="my-1 h-px bg-border/60" />
            ) : null}
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Thinking</div>
            {[
              { label: "On (default)", value: true },
              { label: "Off", value: false },
            ].map((option) => (
              <button
                key={String(option.value)}
                onClick={() => {
                  onThinkingEnabledChange(option.value);
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2.5 w-full px-2.5 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                  (thinkingEnabled ?? true) === option.value ? "bg-accent" : "hover:bg-muted/50"
                }`}
              >
                <span>{option.label}</span>
                {(thinkingEnabled ?? true) === option.value && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            ))}
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// ── Branch selector ─────────────────────────────────────────────────────────

function BranchSelector({
  branch,
  onSelect,
  disabled = false,
}: {
  branch: string;
  onSelect: (branch: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(branch);

  useEffect(() => {
    setInput(branch);
  }, [branch]);

  const handleSelect = (b: string) => {
    onSelect(b);
    setOpen(false);
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors ${
            disabled
              ? "text-muted-foreground/40 cursor-default"
              : "hover:bg-muted/80 cursor-pointer text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span className="hidden sm:inline max-w-[80px] truncate">{branch}</span>
          {!disabled && <ChevronDown className="w-3 h-3 opacity-50" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2" sideOffset={8}>
        <div className="space-y-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSelect(input.trim() || "main");
              }
            }}
            placeholder="Branch name..."
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <button
            onClick={() => handleSelect("main")}
            className={`flex items-center justify-between w-full px-2.5 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
              branch === "main" ? "bg-accent" : "hover:bg-muted/50"
            }`}
          >
            <span>main</span>
            {branch === "main" && <Check className="w-3.5 h-3.5 text-primary" />}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Sandbox mode selector ────────────────────────────────────────────────────

export type SandboxMode = "local" | "cloud_light" | "cloud_full" | "e2b" | "self_hosted";

const LAUNCH_READY_SANDBOX_MODES = new Set<SandboxMode>(["local", "cloud_light", "cloud_full"]);
const HOSTED_PRODUCTION_FALLBACK_SANDBOX_MODE: SandboxMode = "cloud_light";

function isSandboxMode(value: string | null): value is SandboxMode {
  return (
    value === "local" ||
    value === "cloud_light" ||
    value === "cloud_full" ||
    value === "e2b" ||
    value === "self_hosted"
  );
}

function isLaunchReadySandboxMode(mode: SandboxMode) {
  return LAUNCH_READY_SANDBOX_MODES.has(mode);
}

function isHostedProductionUi() {
  if (!import.meta.env.PROD) return false;
  if (Boolean(import.meta.env.VITE_API_URL)) return true;

  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "agentcenter.sh" ||
    window.location.hostname.endsWith(".agentcenter.sh")
  );
}

function defaultSandboxMode() {
  return isHostedProductionUi() ? HOSTED_PRODUCTION_FALLBACK_SANDBOX_MODE : "local";
}

function isHostedProductionHiddenSandboxMode(mode: SandboxMode) {
  return isHostedProductionUi() && (mode === "local" || mode === "self_hosted");
}

function isSelectableSandboxMode(mode: SandboxMode) {
  return isLaunchReadySandboxMode(mode) && !isHostedProductionHiddenSandboxMode(mode);
}

export function runtimeForSandboxMode(mode: SandboxMode): ExecutionRuntime {
  switch (mode) {
    case "cloud_light":
      return {
        target: "cloud",
        provider: "convex_bash",
        sandboxProfile: "lightweight",
        idlePolicy: "sleep",
        resumeOnActivity: true,
      };
    case "cloud_full":
      return {
        target: "cloud",
        provider: "agent_os",
        sandboxProfile: "full",
        idlePolicy: "sleep",
        resumeOnActivity: true,
      };
    case "self_hosted":
      return {
        target: "self_hosted",
        provider: "self_hosted_runner",
        sandboxProfile: "full",
        idlePolicy: "retain",
        resumeOnActivity: true,
      };
    case "e2b":
      return {
        target: "cloud",
        provider: "e2b",
        sandboxProfile: "full",
        idlePolicy: "terminate",
        resumeOnActivity: false,
      };
    case "local":
    default:
      return {
        target: "local",
        provider: "legacy_local",
        sandboxProfile: "none",
        idlePolicy: "retain",
      };
  }
}

export function sandboxModeForProviderKey(key: string): SandboxMode {
  switch (key) {
    case "convex_bash":
      return "cloud_light";
    case "agent_os":
      return "cloud_full";
    case "e2b":
      return "e2b";
    case "self_hosted_runner":
      return "self_hosted";
    default:
      return "local";
  }
}

function SandboxSelector({
  mode,
  onSelect,
}: {
  mode: SandboxMode;
  onSelect: (mode: SandboxMode) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const controlPlaneEnabled = useControlPlaneEnabled();
  const runtimeProviders = useConvexQuery(
    controlPlaneApi.runtimeProviders.list,
    controlPlaneEnabled ? {} : "skip",
  ) as RuntimeProviderRecord[] | undefined;
  const { data: runtimeProviderStatus } = useQuery({
    queryKey: ["runtime-providers"],
    queryFn: getRuntimeProviderStatus,
    staleTime: 30_000,
  });

  const selfHostedConnector = getSelfHostedConnectorConfig();
  const hiddenProviderIds = isHostedProductionUi()
    ? new Set(
        runtimeProviderStatus?.hostedUiPolicy.productionHiddenProviders ?? [
          "legacy_local",
          "self_hosted_runner",
        ],
      )
    : new Set<string>();
  const fallbackOptions: {
    value: SandboxMode;
    label: string;
    icon: React.ElementType;
    desc: string;
    disabled?: boolean;
  }[] = [
    {
      value: "local",
      label: "Local",
      icon: Monitor,
      desc: "Runs through the current built-in backend",
    },
    {
      value: "cloud_light",
      label: "Convex Bash",
      icon: Cloud,
      desc: "Low-cost lightweight runtime for quick tasks and follow-ups",
    },
    {
      value: "cloud_full",
      label: "AgentOS Full",
      icon: Cloud,
      desc: "Full workspace sandbox backed by the current managed runner",
    },
    {
      value: "e2b",
      label: "E2B",
      icon: Cloud,
      desc: "Cloud sandbox status is loading...",
      disabled: true,
    },
    {
      value: "self_hosted",
      label: selfHostedConnector?.label ?? "Self-hosted",
      icon: Settings,
      desc: selfHostedConnector
        ? `${selfHostedConnector.baseUrl}`
        : "Configure a connector in Settings -> Workspace",
      disabled: !selfHostedConnector,
    },
  ];

  const apiRuntimeOptions =
    runtimeProviderStatus?.providers.map((provider: RuntimeProviderStatus) => ({
      value: sandboxModeForProviderKey(provider.id),
      label: provider.label,
      icon:
        provider.target === "self_hosted" ? Settings : provider.target === "cloud" ? Cloud : Monitor,
      desc: provider.launchReady
        ? provider.configured
          ? "Configured and launch-ready"
          : "Launch-ready after configuration"
        : provider.configured
          ? "Configured, not launch-ready"
          : "Not configured, not launch-ready",
      disabled: !provider.launchReady,
    })) ?? [];

  const convexOptions =
    runtimeProviders && runtimeProviders.length > 0
      ? [
          fallbackOptions[0]!,
          ...runtimeProviders
            .filter((provider) => provider.key !== "legacy_local")
            .map((provider) => ({
              value: sandboxModeForProviderKey(provider.key),
              label:
                provider.key === "self_hosted_runner"
                  ? (selfHostedConnector?.label ?? provider.name)
                  : provider.name,
              icon:
                provider.kind === "self_hosted"
                  ? Settings
                  : provider.kind === "full_sandbox"
                    ? Cloud
                    : Monitor,
              desc:
                provider.key === "self_hosted_runner" && !selfHostedConnector
                  ? "Configure a connector in Settings -> Workspace"
                  : (provider.description ?? "Control plane runtime"),
              disabled: provider.key === "self_hosted_runner" && !selfHostedConnector,
            })),
        ]
      : fallbackOptions;

  const optionByMode = new Map<SandboxMode, (typeof fallbackOptions)[number]>();
  for (const opt of [...convexOptions, ...apiRuntimeOptions]) {
    optionByMode.set(opt.value, opt);
  }
  const options = Array.from(optionByMode.values()).filter((opt) => {
    if (opt.value === "local") return !hiddenProviderIds.has("legacy_local");
    if (opt.value === "self_hosted") return !hiddenProviderIds.has("self_hosted_runner");
    return true;
  });

  const selected = options.find((o) => o.value === mode) ?? options[0]!;
  const Icon = selected.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors hover:bg-muted/80 cursor-pointer text-muted-foreground hover:text-foreground">
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{selected.label}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1" sideOffset={8}>
        {options.map((opt) => {
          const OptIcon = opt.icon;
          const isSelected = opt.value === mode;
          return (
            <button
              key={opt.value}
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                onSelect(opt.value);
                setOpen(false);
              }}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                opt.disabled
                  ? "opacity-50 cursor-not-allowed"
                  : isSelected
                    ? "bg-accent"
                    : "hover:bg-muted/50"
              }`}
            >
              <OptIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 text-left">
                <span className="text-foreground">{opt.label}</span>
                <p className="text-[11px] text-muted-foreground/50">{opt.desc}</p>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          );
        })}
        <div className="my-1 h-px bg-border/60" />
        <button
          onClick={() => {
            setOpen(false);
            navigate({ to: "/settings/workspace" });
          }}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Manage runtimes</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FileTypeIcon({ type }: { type: AttachedFile["type"] }) {
  if (type === "image") return <ImageIcon className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PromptBox({
  onSubmit,
  onQueueSubmit,
  onSteerSubmit,
  isStreaming = false,
  isSubmitting = false,
  onStop,
  allowInputWhileStreaming = false,
  defaultConfig,
  onConfigChange,
  placeholder,
  compact = false,
  defaultValue,
  lockConfig = false,
}: PromptBoxProps) {
  const hasDefaultRepoConfig =
    defaultConfig !== undefined &&
    Object.prototype.hasOwnProperty.call(defaultConfig, "repoConnectionId");
  const [value, setValue] = useState(defaultValue ?? "");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(
    () =>
      defaultConfig?.agentModel ?? localStorage.getItem("ac_default_model") ?? "claude-opus-4-6",
  );
  const [reasoningEffort, setReasoningEffort] = useState<
    "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink" | undefined
  >(() => defaultConfig?.agentReasoningEffort);
  const [thinkingEnabled, setThinkingEnabled] = useState<boolean | undefined>(
    () => defaultConfig?.agentThinkingEnabled,
  );
  const [branch, setBranch] = useState(defaultConfig?.branch ?? "main");
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(() =>
    hasDefaultRepoConfig
      ? (defaultConfig?.repoConnectionId ?? null)
      : localStorage.getItem("ac_selected_repo"),
  );
  const [selectedRepo, setSelectedRepo] = useState<RepoConnection | null>(null);
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>(() => {
    if (defaultConfig?.sandboxMode) {
      return isSelectableSandboxMode(defaultConfig.sandboxMode)
        ? defaultConfig.sandboxMode
        : defaultSandboxMode();
    }
    const stored = localStorage.getItem("ac_sandbox_mode");
    return isSandboxMode(stored) && isSelectableSandboxMode(stored) ? stored : defaultSandboxMode();
  });
  const [contextOpen, setContextOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlPlaneEnabled = useControlPlaneEnabled();
  const canComposeWhileStreaming = allowInputWhileStreaming && isStreaming;
  const generateUploadUrl = useConvexMutation(controlPlaneApi.files.generateUploadUrl);
  const saveAttachment = useConvexMutation(controlPlaneApi.files.saveAttachment);
  const { data: restWorkspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/api/workspaces"),
    staleTime: 60_000,
  });
  const defaultWorkspaceId = restWorkspaces[0]?.id ?? null;
  const { data: repoConnections = [] } = useQuery({
    queryKey: ["repo-connections", defaultWorkspaceId],
    queryFn: () =>
      apiGet<RepoConnection[]>(`/api/repo-connections?workspaceId=${defaultWorkspaceId}`),
    staleTime: 60_000,
    enabled: defaultWorkspaceId !== null,
  });

  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0]!;
  const selectedAgent = AGENTS.find((agent) => agent.id === selectedModel.agentId) ?? AGENTS[0]!;

  const { data: credentialStatuses = {}, isLoading: isCredentialLoading } = useQuery({
    queryKey: ["prompt-credentials"],
    queryFn: async () => {
      const entries = await Promise.all(
        AGENTS.filter((agent) => agent.credentialPath).map(
          async (agent) =>
            [agent.id, await apiGet<CredentialStatus>(agent.credentialPath!)] as const,
        ),
      );
      return Object.fromEntries(entries) as Record<string, CredentialStatus>;
    },
    staleTime: 30_000,
  });
  useEffect(() => {
    if (defaultValue !== undefined) {
      setValue(defaultValue);
      textareaRef.current?.focus();
    }
  }, [defaultValue]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  useEffect(() => {
    if (isCredentialLoading) return;
    if (isAgentSelectable(selectedAgent, credentialStatuses)) return;

    const fallbackAgent = AGENTS.find((agent) => credentialStatuses[agent.id]?.connected === true);
    if (!fallbackAgent || fallbackAgent.id === selectedAgent.id) return;

    const fallbackModelId =
      DEFAULT_MODEL_BY_AGENT[fallbackAgent.id] ??
      MODELS.find((model) => model.agentId === fallbackAgent.id && model.isDefault)?.id ??
      MODELS.find((model) => model.agentId === fallbackAgent.id)?.id;

    if (!fallbackModelId) return;

    const fallbackModel = MODELS.find((model) => model.id === fallbackModelId);
    setSelectedModelId(fallbackModelId);
    setReasoningEffort(fallbackModel ? getDefaultReasoningEffort(fallbackModel) : undefined);
    setThinkingEnabled(fallbackModel?.supportsThinkingToggle ? true : undefined);
    localStorage.setItem("ac_default_model", fallbackModelId);
  }, [credentialStatuses, isCredentialLoading, selectedAgent]);

  useEffect(() => {
    if (isSelectableSandboxMode(sandboxMode)) return;
    const fallbackMode = defaultSandboxMode();
    setSandboxMode(fallbackMode);
    localStorage.setItem("ac_sandbox_mode", fallbackMode);
  }, [sandboxMode]);

  const emitConfig = useCallback(
    (
      model: ModelEntry,
      b: string,
      repo: RepoConnection | null,
      mode: SandboxMode,
      repoId = repo?.id ?? selectedRepoId,
      overrides?: {
        agentReasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink";
        agentThinkingEnabled?: boolean;
      },
    ) => {
      onConfigChange?.({
        agentProvider: model.agentId,
        agentModel: model.id,
        agentReasoningEffort:
          overrides?.agentReasoningEffort ?? reasoningEffort ?? getDefaultReasoningEffort(model),
        agentThinkingEnabled: model.supportsThinkingToggle
          ? (overrides?.agentThinkingEnabled ?? thinkingEnabled ?? true)
          : undefined,
        branch: b,
        runtime: runtimeForSandboxMode(mode),
        workspaceId: repo?.workspaceId ?? undefined,
        repoConnectionId: repoId ?? undefined,
        projectId: repo?.projectId ?? undefined,
      });
    },
    [onConfigChange, reasoningEffort, selectedRepoId, thinkingEnabled],
  );

  useEffect(() => {
    emitConfig(selectedModel, branch, selectedRepo, sandboxMode);
  }, [branch, emitConfig, sandboxMode, selectedModel, selectedRepo]);

  useEffect(() => {
    if (selectedRepoId) {
      const matchedRepo = repoConnections.find((repo) => repo.id === selectedRepoId) ?? null;
      if (matchedRepo?.id !== selectedRepo?.id) {
        setSelectedRepo(matchedRepo);
      }
      return;
    }

    if (hasDefaultRepoConfig || repoConnections.length === 0) {
      return;
    }

    const firstRepo = repoConnections[0]!;
    setSelectedRepo(firstRepo);
    setSelectedRepoId(firstRepo.id);
    localStorage.setItem("ac_selected_repo", firstRepo.id);
    if (firstRepo.defaultBranch) {
      setBranch(firstRepo.defaultBranch);
    }
  }, [hasDefaultRepoConfig, repoConnections, selectedRepo?.id, selectedRepoId]);

  const clearComposer = useCallback(() => {
    setValue("");
    setFiles([]);
  }, []);

  const hasContent = value.trim().length > 0 || files.length > 0;

  const isApplePlatform = useMemo(() => {
    if (typeof navigator === "undefined") return true;
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ??
      navigator.platform ??
      "";
    return /(Mac|iPhone|iPad)/i.test(platform);
  }, []);
  const primaryShortcutLabel = `${isApplePlatform ? "Cmd" : "Ctrl"}+Enter`;
  const steerShortcutLabel = `Shift+${primaryShortcutLabel}`;

  const handleSubmit = useCallback(
    (mode: "send" | "queue" | "steer" = "send") => {
      if (isSubmitting) return;
      if (!isCredentialLoading && !isAgentSelectable(selectedAgent, credentialStatuses)) return;
      if (files.some((file) => file.status === "uploading")) return;
      const trimmed = value.trim();
      const uploadedFiles = files.filter((file) => file.status === "uploaded");

      if (!trimmed && uploadedFiles.length === 0) {
        if (isStreaming) {
          onStop?.();
        }
        return;
      }

      if (canComposeWhileStreaming) {
        if (mode === "steer") {
          onSteerSubmit?.(trimmed, uploadedFiles);
        } else {
          onQueueSubmit?.(trimmed, uploadedFiles);
        }
        clearComposer();
        return;
      }

      if (isStreaming) return;

      onSubmit(trimmed, uploadedFiles);
      clearComposer();
    },
    [
      canComposeWhileStreaming,
      clearComposer,
      files,
      isCredentialLoading,
      isStreaming,
      isSubmitting,
      onQueueSubmit,
      onSteerSubmit,
      onStop,
      onSubmit,
      credentialStatuses,
      selectedAgent,
      value,
    ],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canComposeWhileStreaming && e.shiftKey && (value.trim().length > 0 || files.length > 0)) {
        handleSubmit("steer");
        return;
      }

      handleSubmit(canComposeWhileStreaming ? "queue" : "send");
    }
  };

  const uploadFiles = useCallback(
    async (inputFiles: File[]) => {
      const imageFiles = inputFiles.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length !== inputFiles.length) {
        toast.error(
          "Only image uploads are supported right now. Remove non-image files or paste/drop a PNG, JPG, GIF, or WebP image.",
        );
      }

      if (imageFiles.length === 0) {
        return;
      }

      const existingKeys = new Set(files.map((file) => `${file.name}:${file.size}`));
      const uniqueImageFiles = imageFiles.filter(
        (file) => !existingKeys.has(`${file.name}:${file.size}`),
      );

      if (uniqueImageFiles.length !== imageFiles.length) {
        toast.error(
          "That image is already attached. Remove the existing copy first if you want to upload it again.",
        );
      }

      if (uniqueImageFiles.length === 0) {
        return;
      }

      if (!controlPlaneEnabled) {
        toast.error(
          "Image upload is unavailable because Convex is not configured for this app environment.",
        );
        return;
      }

      const workspaceId = restWorkspaces[0]?.id;
      if (!workspaceId) {
        toast.error(
          "Image upload could not start because no workspace exists yet. Create or load a workspace, then try again.",
        );
        return;
      }

      const draftFiles = uniqueImageFiles.map((file) => ({
        id: crypto.randomUUID(),
        contentType: file.type || "application/octet-stream",
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        status: "uploading" as const,
        size: file.size < 1024 ? `${file.size}B` : `${Math.round(file.size / 1024)}KB`,
        type: "image" as const,
        url: null,
      }));

      setFiles((prev) => [...prev, ...draftFiles]);

      await Promise.all(
        draftFiles.map(async (draftFile, index) => {
          const file = uniqueImageFiles[index]!;

          try {
            const uploadUrl = await generateUploadUrl({});
            const uploadResponse = await fetch(uploadUrl, {
              method: "POST",
              headers: {
                "Content-Type": file.type || "application/octet-stream",
              },
              body: file,
            });

            if (!uploadResponse.ok) {
              const body = await uploadResponse.text().catch(() => "");
              throw new Error(
                `Image upload failed for "${file.name}" (${uploadResponse.status}). ${body || "Retry the upload or check Convex storage health."}`,
              );
            }

            const { storageId } = (await uploadResponse.json()) as { storageId: string };
            const saved = await saveAttachment({
              workspaceId: workspaceId as never,
              storageId: storageId as never,
              fileName: file.name,
              contentType: file.type || "application/octet-stream",
              fileSize: file.size,
              kind: "image",
            });

            setFiles((prev) =>
              prev.map((existing) =>
                existing.id === draftFile.id
                  ? {
                      ...existing,
                      attachmentId: saved.attachmentId as string,
                      status: "uploaded",
                      url: saved.url,
                    }
                  : existing,
              ),
            );
          } catch (error) {
            setFiles((prev) =>
              prev.map((existing) =>
                existing.id === draftFile.id ? { ...existing, status: "error" } : existing,
              ),
            );
            toast.error(
              error instanceof Error
                ? error.message
                : `Image upload failed for "${file.name}". Retry the upload or remove the attachment.`,
            );
          }
        }),
      );
    },
    [controlPlaneEnabled, files, generateUploadUrl, restWorkspaces, saveAttachment],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((file) => file.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleModelPick = (model: ModelEntry) => {
    const nextReasoningEffort = getDefaultReasoningEffort(model);
    const nextThinkingEnabled = model.supportsThinkingToggle ? true : undefined;
    setSelectedModelId(model.id);
    setReasoningEffort(nextReasoningEffort);
    setThinkingEnabled(nextThinkingEnabled);
    localStorage.setItem("ac_default_model", model.id);
    emitConfig(model, branch, selectedRepo, sandboxMode, undefined, {
      agentReasoningEffort: nextReasoningEffort,
      agentThinkingEnabled: nextThinkingEnabled,
    });
  };

  const handleReasoningEffortChange = (
    nextValue: "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink",
  ) => {
    setReasoningEffort(nextValue);
    emitConfig(selectedModel, branch, selectedRepo, sandboxMode, undefined, {
      agentReasoningEffort: nextValue,
    });
  };

  const handleThinkingEnabledChange = (nextValue: boolean) => {
    setThinkingEnabled(nextValue);
    emitConfig(selectedModel, branch, selectedRepo, sandboxMode, undefined, {
      agentThinkingEnabled: nextValue,
    });
  };

  const handleBranchSelect = (b: string) => {
    setBranch(b);
    emitConfig(selectedModel, b, selectedRepo, sandboxMode);
  };

  const handleSandboxMode = (mode: SandboxMode) => {
    setSandboxMode(mode);
    localStorage.setItem("ac_sandbox_mode", mode);
    emitConfig(selectedModel, branch, selectedRepo, mode);
  };

  const handleRepoSelect = (repo: RepoConnection | null) => {
    setSelectedRepo(repo);
    setSelectedRepoId(repo?.id ?? null);
    if (repo?.id) {
      localStorage.setItem("ac_selected_repo", repo.id);
    } else {
      localStorage.removeItem("ac_selected_repo");
    }
    if (repo?.defaultBranch) {
      setBranch(repo.defaultBranch);
      emitConfig(selectedModel, repo.defaultBranch, repo, sandboxMode);
    } else {
      emitConfig(selectedModel, branch, repo, sandboxMode);
    }
  };

  const hasProviderCredentials = isAgentSelectable(selectedAgent, credentialStatuses);
  const hasPendingUploads = files.some((file) => file.status === "uploading");

  const resolvedPlaceholder =
    placeholder || (compact ? "Send a message..." : "Describe what you want to build...");
  const providerNotice =
    !isCredentialLoading && !hasProviderCredentials
      ? `${selectedAgent.label} is not connected. Add credentials in Settings -> Models before starting a run.`
      : null;
  const repoNotice = selectedRepoId === null ? "Select a repository before starting a run." : null;

  return (
    <div className="w-full">
      <div
        className={`rounded-xl border bg-card shadow-sm overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-ring/50 ${
          isDragActive ? "border-primary/60 ring-2 ring-primary/20" : "border-border"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setIsDragActive(false);
          }
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setIsDragActive(false);
          await uploadFiles(Array.from(event.dataTransfer.files || []));
        }}
      >
        {/* Attached files */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-lg bg-muted text-xs text-foreground"
              >
                {file.type === "image" && (file.url || file.previewUrl) ? (
                  <img
                    src={file.url ?? file.previewUrl}
                    alt={file.name}
                    className="h-10 w-10 rounded-md object-cover border border-border/50"
                  />
                ) : (
                  <FileTypeIcon type={file.type} />
                )}
                <div className="min-w-0">
                  <span className="block max-w-[140px] truncate">{file.name}</span>
                  <span className="block text-muted-foreground">
                    {file.status === "uploading"
                      ? "Uploading..."
                      : file.status === "error"
                        ? "Upload failed"
                        : file.size}
                  </span>
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={async (event) => {
            const pastedFiles = Array.from(event.clipboardData.files || []).filter((file) =>
              file.type.startsWith("image/"),
            );
            if (pastedFiles.length === 0) return;
            event.preventDefault();
            await uploadFiles(pastedFiles);
          }}
          disabled={isStreaming && !allowInputWhileStreaming}
          placeholder={resolvedPlaceholder}
          className={`
            w-full bg-transparent text-sm text-card-foreground
            placeholder:text-muted-foreground
            resize-none outline-none
            px-4 py-3
            max-h-[40vh]
            disabled:cursor-not-allowed disabled:opacity-50
            ${compact ? "min-h-[44px]" : "min-h-[100px]"}
          `}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2 pt-0">
          {/* Left: inline selectors — repo | branch | model | traits | runtime */}
          <div className="flex items-center gap-0.5">
            <RepoSelector
              selectedRepoId={selectedRepoId}
              onSelect={handleRepoSelect}
              disabled={lockConfig}
            />

            <div className="w-px h-4 bg-border/50" />

            <BranchSelector branch={branch} onSelect={handleBranchSelect} disabled={lockConfig} />

            <div className="w-px h-4 bg-border/50" />

            <ModelSelector
              selectedModelId={selectedModelId}
              credentialStatuses={credentialStatuses}
              isCredentialLoading={isCredentialLoading}
              onSelect={handleModelPick}
            />

            <TraitsSelector
              model={selectedModel}
              reasoningEffort={reasoningEffort}
              thinkingEnabled={thinkingEnabled}
              onReasoningEffortChange={handleReasoningEffortChange}
              onThinkingEnabledChange={handleThinkingEnabledChange}
            />

            <div className="w-px h-4 bg-border/50" />

            <SandboxSelector mode={sandboxMode} onSelect={handleSandboxMode} />
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              data-testid="prompt-image-upload"
              className="hidden"
              onChange={handleFileChange}
            />

            <Popover open={contextOpen} onOpenChange={setContextOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  title="Attach"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1" sideOffset={8}>
                <label className="relative flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer overflow-hidden">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    data-testid="prompt-image-upload-visible"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                  />
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <span className="block">Upload image</span>
                    <span className="block text-[11px] text-muted-foreground/60">
                      Paste, drag, or browse
                    </span>
                  </div>
                </label>
              </PopoverContent>
            </Popover>

            {canComposeWhileStreaming && hasContent ? (
              <Button
                onClick={() => handleSubmit("steer")}
                disabled={
                  isSubmitting || !hasProviderCredentials || hasPendingUploads || !selectedRepoId
                }
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-[11px]"
                title={`Steer current run (${steerShortcutLabel})`}
              >
                Steer
              </Button>
            ) : null}

            {isStreaming && !canComposeWhileStreaming ? (
              <Button
                onClick={onStop}
                size="icon"
                variant="destructive"
                className="h-7 w-7 rounded-full ml-1"
                title="Stop"
              >
                <Square className="w-3 h-3" fill="currentColor" />
              </Button>
            ) : (
              <Button
                onClick={() => handleSubmit(canComposeWhileStreaming ? "queue" : "send")}
                disabled={
                  isStreaming && !canComposeWhileStreaming
                    ? true
                    : (!hasContent && !isStreaming) ||
                      isSubmitting ||
                      !hasProviderCredentials ||
                      hasPendingUploads ||
                      !selectedRepoId
                }
                size="icon"
                className="h-7 w-7 rounded-full ml-1"
                title={
                  canComposeWhileStreaming
                    ? hasContent
                      ? `Queue follow-up (${primaryShortcutLabel})`
                      : `Stop current run (${primaryShortcutLabel})`
                    : isStreaming
                      ? "Stop"
                      : `Send (${primaryShortcutLabel})`
                }
              >
                {isStreaming && canComposeWhileStreaming && !hasContent ? (
                  <Square className="w-3 h-3" fill="currentColor" />
                ) : isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CornerDownLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                )}
              </Button>
            )}
          </div>
        </div>
        {repoNotice && !providerNotice && (
          <div className="px-4 pb-3 text-[11px] text-muted-foreground/75">{repoNotice}</div>
        )}
        {providerNotice && (
          <div className="px-4 pb-3 text-[11px] text-amber-600">{providerNotice}</div>
        )}
      </div>
    </div>
  );
}
