import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { apiGet, apiPost, apiDelete } from '../../lib/api-client';
import { getApiUrl } from '../../lib/config';

// -- Types ------------------------------------------------------------------

interface CredentialStatus {
  connected: boolean;
  source: 'api_key' | null;
  email: string | null;
  expiresAt: string | null;
  subscriptionType: string | null;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

// -- Hooks ------------------------------------------------------------------

function useCredentialStatus() {
  return useQuery({
    queryKey: ['credentials', 'claude'],
    queryFn: () => apiGet<CredentialStatus>('/api/credentials/claude'),
    staleTime: 60_000,
  });
}

function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiGet<Workspace[]>('/api/workspaces'),
    staleTime: 60_000,
  });
}

// -- Claude Connection Card -------------------------------------------------

function ClaudeConnectionCard() {
  const { data: credStatus, refetch, isLoading } = useCredentialStatus();
  const [apiKey, setApiKey] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const disconnectMutation = useMutation({
    mutationFn: () => apiDelete<{ deleted: boolean }>('/api/credentials/claude'),
    onSuccess: () => { void refetch(); },
  });

  const apiKeyMutation = useMutation({
    mutationFn: (key: string) => apiPost<CredentialStatus>('/api/credentials/claude/api-key', { apiKey: key }),
    onSuccess: () => {
      setApiKey('');
      setApiKeyError(null);
      void refetch();
    },
    onError: (err: Error) => {
      setApiKeyError(err.message ?? 'Failed to save API key');
    },
  });

  function handleSaveApiKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    apiKeyMutation.mutate(trimmed);
  }

  const isConnected = credStatus?.connected === true;
  const isMutating = disconnectMutation.isPending || apiKeyMutation.isPending;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-50">
          Claude Connection
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <span
            className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
              isConnected ? 'bg-green-500' : 'bg-zinc-600'
            }`}
          />
          <div>
            {isLoading ? (
              <div className="h-4 w-32 rounded bg-zinc-800 animate-pulse" />
            ) : isConnected ? (
              <>
                <p className="text-sm font-medium text-zinc-100">Connected</p>
                {credStatus?.email && (
                  <p className="text-xs text-zinc-400 mt-0.5">{credStatus.email}</p>
                )}
                {credStatus?.subscriptionType && (
                  <p className="text-xs text-zinc-500 mt-0.5 capitalize">
                    {credStatus.subscriptionType} subscription
                  </p>
                )}
                <p className="text-xs text-zinc-600 mt-0.5">via API key</p>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-400">Not connected</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Provide an API key from{' '}
                  <a
                    href="https://console.anthropic.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 underline underline-offset-2 hover:text-zinc-300"
                  >
                    console.anthropic.com
                  </a>
                  , or authenticate the host's Claude CLI.
                </p>
              </>
            )}
          </div>
        </div>

        {isConnected ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => disconnectMutation.mutate()}
            disabled={isMutating}
            className="w-full lg:w-auto"
          >
            {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        ) : (
          <form onSubmit={handleSaveApiKey} className="space-y-3">
            <Input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
              autoComplete="off"
              spellCheck={false}
            />
            {apiKeyError && (
              <p className="text-xs text-red-400">{apiKeyError}</p>
            )}
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!apiKey.trim() || apiKeyMutation.isPending}
              className="w-full lg:w-auto"
            >
              {apiKeyMutation.isPending ? 'Saving...' : 'Save API Key'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// -- Workspace Card ---------------------------------------------------------

function WorkspaceCard() {
  const { data: workspaces, isLoading } = useWorkspaces();
  const workspace = workspaces?.[0];

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-50">
          Workspace
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-40 rounded bg-zinc-800 animate-pulse" />
            <div className="h-3 w-24 rounded bg-zinc-800 animate-pulse" />
          </div>
        ) : workspace ? (
          <div>
            <p className="text-sm font-medium text-zinc-100">{workspace.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">/{workspace.slug}</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No workspace found.</p>
        )}
      </CardContent>
    </Card>
  );
}

// -- API Keys Card ----------------------------------------------------------

interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ApiKeyCreateResponse extends ApiKeyEntry {
  key: string;
}

function ApiKeysCard() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiGet<ApiKeyEntry[]>('/api/api-keys'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost<ApiKeyCreateResponse>('/api/api-keys', { name }),
    onSuccess: (data) => {
      setRevealedKey(data.key);
      setNewKeyName('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/api-keys/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setRevealedKey(null);
    createMutation.mutate(newKeyName.trim());
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-50">
          API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-zinc-500">
          Use API keys to authenticate programmatic access or connect a remote frontend.
        </p>

        {revealedKey && (
          <div className="rounded-md border border-green-800/50 bg-green-900/30 p-3">
            <p className="text-xs text-green-400 mb-1">
              Copy this key now — it won't be shown again.
            </p>
            <code className="text-xs text-green-300 break-all select-all font-mono">
              {revealedKey}
            </code>
          </div>
        )}

        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. CI/CD)"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!newKeyName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </form>

        {isLoading && <p className="text-xs text-zinc-500">Loading keys...</p>}

        {keys.length > 0 && (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-zinc-200">{k.name}</p>
                  <p className="text-xs text-zinc-500 font-mono">
                    {k.keyPrefix}...
                    {k.lastUsedAt && (
                      <> · last used {new Date(k.lastUsedAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-400 border-zinc-700 hover:bg-red-900/30 hover:text-red-300"
                  onClick={() => deleteMutation.mutate(k.id)}
                  disabled={deleteMutation.isPending}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -- Settings Page ----------------------------------------------------------

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-50">Settings</h1>

      <div className="grid grid-cols-1 gap-6 max-w-2xl">
        <ClaudeConnectionCard />
        <ApiKeysCard />
        <WorkspaceCard />
      </div>
    </div>
  );
}
