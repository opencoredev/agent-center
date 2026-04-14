import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderGit2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

// ── Types ───────────────────────────────────────────────────────────────────

interface RepoConnection {
  id: string;
  workspaceId: string;
  provider: string;
  owner: string;
  repo: string;
  defaultBranch: string | null;
  createdAt: string;
}

interface Workspace {
  id: string;
  name: string;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function RepositoriesPage() {
  const queryClient = useQueryClient();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: repos = [], isLoading } = useQuery({
    queryKey: ['repo-connections'],
    queryFn: () => apiGet<RepoConnection[]>('/api/repo-connections'),
    staleTime: 30_000,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiGet<Workspace[]>('/api/workspaces'),
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (input: { owner: string; repo: string }) =>
      apiPost<RepoConnection>('/api/repo-connections', {
        workspaceId: workspaces[0]?.id,
        provider: 'github',
        owner: input.owner,
        repo: input.repo,
        defaultBranch: 'main',
        authType: 'pat',
      }),
    onSuccess: () => {
      setOwner('');
      setRepo('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['repo-connections'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/repo-connections/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['repo-connections'] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!owner.trim() || !repo.trim()) return;
    createMutation.mutate({ owner: owner.trim(), repo: repo.trim() });
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Repositories</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect GitHub repositories for your agent to work with.
        </p>
      </div>

      {/* Add repo form */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Add Repository</h2>
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
            disabled={!owner.trim() || !repo.trim() || createMutation.isPending}
          >
            <Plus className="w-3.5 h-3.5" />
            {createMutation.isPending ? 'Adding...' : 'Add'}
          </Button>
        </form>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </section>

      {/* Connected repos */}
      <section>
        <h2 className="text-sm font-medium text-foreground mb-3">Connected Repositories</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <FolderGit2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No repositories connected</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add a repository above to get started
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {repos.map((rc) => (
              <div key={rc.id} className="flex items-center gap-3 px-4 py-3">
                <FolderGit2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {rc.owner}/{rc.repo}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Workspace: {workspaces.find((workspace) => workspace.id === rc.workspaceId)?.name ?? rc.workspaceId}
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
