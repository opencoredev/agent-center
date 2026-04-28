import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ExternalLink,
  FolderGit2,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";

interface RepoConnection {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  provider: string;
  owner: string;
  repo: string;
  defaultBranch: string | null;
  authType?: string;
  createdAt: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface GitHubAppStatus {
  configured: boolean;
  appId: string | null;
  slug: string | null;
  clientId: string | null;
  installUrl: string | null;
  callbackUrl: string | null;
  setupUrl: string | null;
}

interface GitHubInstallUrl {
  installUrl: string;
}

interface GitHubInstallation {
  id: number;
  accountLogin: string;
  accountAvatarUrl: string | null;
  accountType: string;
  repositorySelection: string;
  permissions: Record<string, string>;
  url: string;
}

interface GitHubInstallationRepository {
  id: number;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  visibility?: string | null;
}

interface GitHubInstallationRepositoryPage {
  totalCount: number;
  repositories: GitHubInstallationRepository[];
}

function GitHubMark({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.41 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.71.08-.71 1.16.08 1.76 1.19 1.76 1.19 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a10.98 10.98 0 0 1 5.77 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.24 2.75.12 3.04.73.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.77 1.07.77 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.66 18.35.5 12 .5Z" />
    </svg>
  );
}

export function RepositoriesPage() {
  const queryClient = useQueryClient();
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedInstallationId, setSelectedInstallationId] = useState<number | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  const installReturnParams = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        installationId: null as number | null,
        setupAction: null as string | null,
        state: null as string | null,
      };
    }

    const params = new URLSearchParams(window.location.search);
    const rawInstallationId = params.get("installation_id");
    const parsedInstallationId = rawInstallationId ? Number(rawInstallationId) : null;

    return {
      installationId:
        parsedInstallationId !== null &&
        Number.isInteger(parsedInstallationId) &&
        parsedInstallationId > 0
          ? parsedInstallationId
          : null,
      setupAction: params.get("setup_action"),
      state: params.get("state"),
    };
  }, []);

  const {
    data: workspaces = [],
    isLoading: workspacesLoading,
    isFetching: workspacesFetching,
  } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiGet<Workspace[]>("/api/workspaces"),
    staleTime: 60_000,
  });
  const workspaceId = workspaces[0]?.id ?? null;

  const { data: repos = [], isLoading } = useQuery({
    queryKey: ["repo-connections", workspaceId],
    queryFn: () => apiGet<RepoConnection[]>(`/api/repo-connections?workspaceId=${workspaceId}`),
    staleTime: 30_000,
    enabled: workspaceId !== null,
  });

  const { data: githubAppStatus } = useQuery({
    queryKey: ["github-app-status"],
    queryFn: () => apiGet<GitHubAppStatus>("/api/github/app"),
    staleTime: 60_000,
  });

  const {
    data: githubInstallUrl,
    isLoading: installUrlLoading,
    isFetching: installUrlFetching,
    error: installUrlError,
  } = useQuery({
    queryKey: ["github-install-url", workspaceId],
    queryFn: () => apiGet<GitHubInstallUrl>(`/api/github/install-url?workspaceId=${workspaceId}`),
    staleTime: 5 * 60_000,
    enabled: githubAppStatus?.configured === true && workspaceId !== null,
  });
  const installUrl = githubInstallUrl?.installUrl ?? null;
  const isPreparingConnect =
    githubAppStatus?.configured === true &&
    (workspacesLoading || workspacesFetching || installUrlLoading || installUrlFetching);

  const {
    data: installations = [],
    isLoading: installationsLoading,
    isFetching: installationsFetching,
    refetch: refetchInstallations,
  } = useQuery({
    queryKey: ["github-installations", workspaceId, installReturnParams.installationId],
    queryFn: () => {
      const params = new URLSearchParams({ workspaceId: workspaceId! });
      if (installReturnParams.installationId !== null) {
        params.set("installationId", String(installReturnParams.installationId));
      }
      if (installReturnParams.state) {
        params.set("state", installReturnParams.state);
      }

      return apiGet<GitHubInstallation[]>(`/api/github/installations?${params}`);
    },
    staleTime: 30_000,
    enabled: githubAppStatus?.configured === true && workspaceId !== null,
  });

  const installationId = useMemo(
    () => selectedInstallationId ?? installations[0]?.id ?? null,
    [installations, selectedInstallationId],
  );

  useEffect(() => {
    if (installReturnParams.installationId !== null) {
      setSelectedInstallationId(installReturnParams.installationId);
    }
  }, [installReturnParams.installationId]);

  const {
    data: installationReposPage,
    isLoading: reposLoading,
    isFetching: reposFetching,
    refetch: refetchInstallationRepos,
  } = useQuery({
    queryKey: [
      "github-installation-repositories",
      installationId,
      workspaceId,
      installReturnParams.state,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ workspaceId: workspaceId! });
      if (installReturnParams.state) {
        params.set("state", installReturnParams.state);
      }

      return apiGet<GitHubInstallationRepositoryPage>(
        `/api/github/installations/${installationId}/repositories?${params}`,
      );
    },
    staleTime: 30_000,
    enabled:
      installationId !== null &&
      workspaceId !== null &&
      (installReturnParams.installationId === null ||
        installations.some((installation) => installation.id === installationId)),
  });

  const installationRepos = useMemo(
    () => installationReposPage?.repositories ?? [],
    [installationReposPage],
  );

  const connectedRepoIds = useMemo(
    () =>
      new Set(
        repos.map(
          (connected) => `${connected.owner.toLowerCase()}/${connected.repo.toLowerCase()}`,
        ),
      ),
    [repos],
  );

  const availableRepos = useMemo(
    () =>
      installationRepos.filter(
        (candidate) =>
          !connectedRepoIds.has(
            `${candidate.ownerLogin.toLowerCase()}/${candidate.name.toLowerCase()}`,
          ),
      ),
    [connectedRepoIds, installationRepos],
  );

  const createMutation = useMutation({
    mutationFn: (input: { owner: string; repo: string }) =>
      apiPost<RepoConnection>("/api/repo-connections", {
        workspaceId,
        provider: "github",
        owner: input.owner,
        repo: input.repo,
        defaultBranch: "main",
        authType: "pat",
      }),
    onSuccess: () => {
      setOwner("");
      setRepo("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["repo-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["repo-connections", workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const connectInstalledRepoMutation = useMutation({
    mutationFn: (input: GitHubInstallationRepository) =>
      apiPost<RepoConnection>("/api/repo-connections", {
        workspaceId,
        projectId: null,
        provider: "github",
        owner: input.ownerLogin,
        repo: input.name,
        defaultBranch: input.defaultBranch,
        authType: "github_app_installation",
        connectionMetadata: {
          installationId,
        },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["repo-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["repo-connections", workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/repo-connections/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repo-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["repo-connections", workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      setError("Load a workspace before adding a repository.");
      return;
    }
    if (!owner.trim() || !repo.trim()) return;
    createMutation.mutate({ owner: owner.trim(), repo: repo.trim() });
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Repositories</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect GitHub repositories for your agent to work with.
        </p>
      </div>

      <section className="mb-10">
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
          {installReturnParams.installationId !== null ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm text-foreground">
                GitHub App {installReturnParams.setupAction === "install" ? "installed" : "updated"}{" "}
                for <span className="font-mono">#{installReturnParams.installationId}</span>.
                Refresh below to pull in the newest repositories.
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
              <GitHubMark className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-base font-semibold text-foreground">Connect with GitHub App</p>
              <p className="text-sm text-muted-foreground mt-1">
                {githubAppStatus === undefined
                  ? "Checking GitHub App configuration..."
                  : githubAppStatus.configured
                  ? `Install ${githubAppStatus.slug ? `@${githubAppStatus.slug}` : "the app"}, then choose repositories from your installations below.`
                  : "GitHub App is not configured in this environment."}
              </p>
            </div>
            {installUrl ? (
              <Button asChild size="sm" className="gap-1.5">
                <a href={installUrl} target="_blank" rel="noreferrer">
                  <Link2 className="w-3.5 h-3.5" />
                  Connect GitHub
                </a>
              </Button>
            ) : githubAppStatus?.configured ? (
              <Button size="sm" className="gap-1.5" disabled>
                <Link2 className="w-3.5 h-3.5" />
                {isPreparingConnect ? "Preparing..." : "Connect unavailable"}
              </Button>
            ) : null}
          </div>

          {githubAppStatus?.configured && !installUrl && !isPreparingConnect ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">
                {installUrlError instanceof Error
                  ? installUrlError.message
                  : "Agent Center could not prepare the GitHub install link. Refresh and try again."}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!githubAppStatus?.configured || workspaceId === null || installationsFetching}
              onClick={() => {
                void refetchInstallations();
                if (installationId !== null) {
                  void refetchInstallationRepos();
                }
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${installationsFetching ? "animate-spin" : ""}`} />
              Refresh Installations
            </Button>
            {installUrl ? (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <a href={installUrl} target="_blank" rel="noreferrer">
                  Don&apos;t see a repository? Add more organizations or repos
                </a>
              </Button>
            ) : null}
            {githubAppStatus?.configured && workspaceId === null ? (
              <span className="text-xs text-muted-foreground">
                Preparing your workspace before GitHub can connect.
              </span>
            ) : null}
          </div>

          {githubAppStatus?.configured ? (
            <div className="grid gap-5 xl:grid-cols-[240px,1fr]">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.16em]">
                  Installations
                </p>
                {installationsLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 rounded-md bg-muted animate-pulse" />
                    <div className="h-10 rounded-md bg-muted animate-pulse" />
                  </div>
                ) : installations.length > 0 ? (
                  installations.map((installation) => (
                    <button
                      key={installation.id}
                      onClick={() => setSelectedInstallationId(installation.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        installation.id === installationId
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground">
                        {installation.accountLogin}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {installation.repositorySelection === "all"
                          ? "All repositories"
                          : "Selected repositories"}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No installations found yet. Click Connect GitHub, install the app, then refresh.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.16em]">
                      Available Repositories
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Connect repositories from the selected GitHub installation.
                    </p>
                  </div>
                  {installationId !== null ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => void refetchInstallationRepos()}
                    >
                      Refresh repos
                    </Button>
                  ) : null}
                </div>

                {reposLoading || reposFetching ? (
                  <div className="space-y-2">
                    <div className="h-12 rounded-md bg-muted animate-pulse" />
                    <div className="h-12 rounded-md bg-muted animate-pulse" />
                  </div>
                ) : availableRepos.length > 0 ? (
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {availableRepos.map((installationRepo) => (
                      <div key={installationRepo.id} className="flex items-center gap-3 px-4 py-3">
                        <FolderGit2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {installationRepo.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Default branch: {installationRepo.defaultBranch}
                          </p>
                        </div>
                        <a
                          href={installationRepo.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <Button
                          size="sm"
                          disabled={
                            connectInstalledRepoMutation.isPending ||
                            !workspaces[0]?.id ||
                            installationId === null
                          }
                          onClick={() => connectInstalledRepoMutation.mutate(installationRepo)}
                        >
                          Connect
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 p-5">
                    <p className="text-sm text-foreground">
                      {installationId === null
                        ? "Select an installation to browse repositories."
                        : "No more repositories available from this installation right now."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      If you don&apos;t see a repository, click Connect GitHub to add more repos or
                      install the app on another organization, then refresh.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Connected Repositories</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Repositories already available to your agents.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setShowManualForm((current) => !current)}
          >
            <Plus className="w-3.5 h-3.5" />
            Manual Fallback
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showManualForm ? "rotate-180" : ""}`}
            />
          </Button>
        </div>

        {showManualForm ? (
          <div className="rounded-xl border border-border bg-card p-4 mb-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Add Manually</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Use this only if you need to connect a repository without going through the GitHub App
              flow.
            </p>
            <form onSubmit={handleCreate} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Owner</label>
                <Input
                  placeholder="e.g. myorg"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="h-9"
                />
              </div>
              <span className="text-muted-foreground/40 text-lg pb-1.5">/</span>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Repository</label>
                <Input
                  placeholder="e.g. my-app"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="h-9 gap-1.5"
                disabled={!workspaceId || !owner.trim() || !repo.trim() || createMutation.isPending}
              >
                <Plus className="w-3.5 h-3.5" />
                {createMutation.isPending ? "Adding..." : "Add"}
              </Button>
            </form>
          </div>
        ) : null}

        {error && <p className="text-xs text-destructive mt-2 mb-3">{error}</p>}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
            <GitHubMark className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">No repositories connected yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Connect GitHub above, choose an installation, and add repositories from the list.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {repos.map((rc) => (
              <div key={rc.id} className="flex items-center gap-3 px-4 py-3">
                <FolderGit2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">
                      {rc.owner}/{rc.repo}
                    </p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {rc.authType === "github_app_installation" ? "GitHub App" : "Manual"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Workspace:{" "}
                    {workspaces.find((workspace) => workspace.id === rc.workspaceId)?.name ??
                      rc.workspaceId}
                  </p>
                  {rc.defaultBranch && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Default branch: {rc.defaultBranch}
                    </p>
                  )}
                </div>
                <a
                  href={`https://github.com/${rc.owner}/${rc.repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => deleteMutation.mutate(rc.id)}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
