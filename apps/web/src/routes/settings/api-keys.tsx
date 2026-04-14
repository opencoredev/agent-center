import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

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

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  function handleCopy() {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">API Keys</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create API keys for programmatic access or connecting a remote frontend.
        </p>
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="rounded-lg border border-status-success/20 bg-status-success/5 p-4 mb-6">
          <p className="text-xs text-status-success font-medium mb-2">
            Copy this key now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-status-success break-all select-all font-mono bg-status-success/10 rounded px-2 py-1.5">
              {revealedKey}
            </code>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md text-status-success hover:bg-status-success/10 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <section className="mb-8">
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. CI/CD, staging)"
            className="flex-1 h-9"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={!newKeyName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </form>
      </section>

      {/* Key list */}
      <section>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">No API keys yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create a key above to get started
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{k.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {k.keyPrefix}...
                    {k.lastUsedAt && (
                      <span className="text-muted-foreground/50">
                        {' '}· last used {new Date(k.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                  onClick={() => deleteMutation.mutate(k.id)}
                  disabled={deleteMutation.isPending}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
