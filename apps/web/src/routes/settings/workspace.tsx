import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQuery as useConvexQuery } from 'convex/react';
import { api as controlPlaneApi } from '@agent-center/control-plane/api';
import { CheckCircle2, Cloud, HardDrive, PlugZap, ServerCog } from 'lucide-react';
import { apiGet } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useControlPlaneEnabled } from '@/contexts/convex-context';
import {
  clearSelfHostedConnectorConfig,
  getSelfHostedConnectorConfig,
  saveSelfHostedConnectorConfig,
} from '@/lib/execution-connectors';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

interface RuntimeProviderRecord {
  key: string;
  name: string;
  description?: string;
  kind: 'lightweight' | 'full_sandbox' | 'self_hosted';
}

export function WorkspacePage() {
  const controlPlaneEnabled = useControlPlaneEnabled();
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiGet<Workspace[]>('/api/workspaces'),
    staleTime: 60_000,
  });
  const runtimeProviders = useConvexQuery(
    controlPlaneApi.runtimeProviders.list,
    controlPlaneEnabled ? {} : 'skip',
  ) as RuntimeProviderRecord[] | undefined;

  const workspace = workspaces?.[0];
  const [connector, setConnector] = useState(() => getSelfHostedConnectorConfig());
  const [label, setLabel] = useState(connector?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(connector?.baseUrl ?? '');
  const convexUrl = import.meta.env.CONVEX_URL || import.meta.env.VITE_CONVEX_URL;

  const runtimeCards = useMemo(() => {
    const fallback: RuntimeProviderRecord[] = [
      {
        key: 'legacy_local',
        kind: 'lightweight',
        name: 'Local Bash',
        description: 'Runs through the built-in local runner.',
      },
      {
        key: 'convex_bash',
        kind: 'lightweight',
        name: 'Hosted Cloud',
        description: 'Managed lightweight cloud runtime for quick tasks and follow-ups.',
      },
      {
        key: 'agent_os',
        kind: 'full_sandbox',
        name: 'AgentOS Full Sandbox',
        description: 'Full workspace sandbox with room for longer runs.',
      },
      {
        key: 'self_hosted_runner',
        kind: 'self_hosted',
        name: 'Self-hosted Connector',
        description: 'Bring your own runner and keep execution on your infrastructure.',
      },
    ];

    return (runtimeProviders?.length ? runtimeProviders : fallback).map((runtime) => ({
      ...runtime,
      ready:
        runtime.key === 'legacy_local' ||
        runtime.key === 'convex_bash' ||
        runtime.key === 'agent_os' ||
        (runtime.key === 'self_hosted_runner' && Boolean(connector)),
    }));
  }, [connector, runtimeProviders]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-8 py-8 animate-page-enter">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Workspace & Runtimes</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage workspace identity and hosted runtime availability from one place.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Workspace profile</p>
                <p className="text-xs text-muted-foreground">Core identity used across tasks, runs, and repos.</p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="h-16 rounded-xl bg-muted animate-pulse" />
                <div className="h-16 rounded-xl bg-muted animate-pulse" />
                <div className="h-16 rounded-xl bg-muted animate-pulse" />
              </div>
            ) : workspace ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Name</p>
                  <p className="text-sm font-medium text-foreground">{workspace.name}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Slug</p>
                  <p className="truncate font-mono text-sm text-foreground">/{workspace.slug}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Created</p>
                  <p className="text-sm text-foreground">{new Date(workspace.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No workspace found.</p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Runtime modes</p>
                <p className="text-xs text-muted-foreground">
                  These are the same hosted runtime choices shown in the task composer.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                <span>{runtimeCards.filter((runtime) => runtime.ready).length} ready</span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {runtimeCards.map((runtime) => {
                const Icon =
                  runtime.kind === 'self_hosted'
                    ? PlugZap
                    : runtime.kind === 'full_sandbox'
                    ? ServerCog
                    : Cloud;

                return (
                  <div key={runtime.key} className="rounded-xl border border-border/70 bg-background/60 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg border border-border/70 bg-card p-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {runtime.key === 'convex_bash' ? 'Hosted Cloud' : runtime.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {runtime.key === 'convex_bash'
                              ? 'Managed lightweight cloud runtime for quick tasks and follow-ups.'
                              : runtime.description}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          runtime.ready
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {runtime.ready ? 'Ready' : 'Needs setup'}
                      </span>
                    </div>
                    {runtime.key === 'self_hosted_runner' && connector ? (
                      <p className="text-xs text-muted-foreground">
                        Active connector: <span className="font-medium text-foreground">{connector.label}</span>{' '}
                        <span className="font-mono">{connector.baseUrl}</span>
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <Cloud className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Hosted control plane</p>
                <p className="text-xs text-muted-foreground">Realtime orchestration, runtime registry, and shared state.</p>
              </div>
            </div>

            {convexUrl ? (
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Connected
                </div>
                <p className="truncate font-mono text-xs text-foreground">{convexUrl}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-background/60 p-4 text-xs text-muted-foreground">
                Convex is not configured in this environment yet.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <PlugZap className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Self-hosted connector</p>
                <p className="text-xs text-muted-foreground">Used by the runtime picker when you want runs to stay on your own runner.</p>
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Label</label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My runner" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Base URL</label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://runner.example.com" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                onClick={() => {
                  const next = { label: label.trim(), baseUrl: baseUrl.trim() };
                  if (!next.label || !next.baseUrl) return;
                  saveSelfHostedConnectorConfig(next);
                  setConnector(next);
                }}
                disabled={!label.trim() || !baseUrl.trim()}
              >
                Save Connector
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearSelfHostedConnectorConfig();
                  setConnector(null);
                  setLabel('');
                  setBaseUrl('');
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
