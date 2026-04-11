import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Cloud, PlugZap } from 'lucide-react';
import { apiGet } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export function WorkspacePage() {
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiGet<Workspace[]>('/api/workspaces'),
    staleTime: 60_000,
  });

  const workspace = workspaces?.[0];
  const [connector, setConnector] = useState(() => getSelfHostedConnectorConfig());
  const [label, setLabel] = useState(connector?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(connector?.baseUrl ?? '');

  const convexUrl = import.meta.env.CONVEX_URL || import.meta.env.VITE_CONVEX_URL;

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your workspace settings.
        </p>
      </div>

      <section>
        <div className="rounded-lg border border-border bg-card p-5">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-5 w-40 rounded bg-muted animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            </div>
          ) : workspace ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <p className="text-sm font-medium text-foreground">{workspace.name}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Slug</label>
                <p className="text-sm text-foreground font-mono">/{workspace.slug}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Created</label>
                <p className="text-sm text-muted-foreground">
                  {new Date(workspace.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No workspace found.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Execution Backends</h2>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <Cloud className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Convex Cloud</p>
                <p className="text-xs text-muted-foreground">Connected control plane</p>
              </div>
            </div>
            {convexUrl ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                <span className="font-mono truncate">{convexUrl}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not configured in this environment.</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <PlugZap className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Self-hosted Connector</p>
                <p className="text-xs text-muted-foreground">
                  Store the connector endpoint shown in the runtime picker.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Label</label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My runner" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Base URL</label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://runner.example.com" />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
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

            {connector && (
              <p className="text-xs text-muted-foreground mt-3">
                Active connector: <span className="font-medium text-foreground">{connector.label}</span> at{' '}
                <span className="font-mono">{connector.baseUrl}</span>
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
