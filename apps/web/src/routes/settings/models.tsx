import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { AGENTS, MODELS, type ModelEntry, type AgentEntry } from '@/components/chat/prompt-box';

// ── Types ───────────────────────────────────────────────────────────────────

interface CredentialStatus {
  connected: boolean;
  source: 'api_key' | 'oauth' | null;
  email: string | null;
  expiresAt: string | null;
  subscriptionType: string | null;
}

interface ProviderConfig {
  id: string;
  agentId: string;
  title: string;
  credentialPath: string;
  consoleUrl: string;
  consoleDomain: string;
  keyPlaceholder: string;
  logoUrl: string;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'claude',
    agentId: 'claude',
    title: 'Claude',
    credentialPath: '/api/credentials/claude',
    consoleUrl: 'https://console.anthropic.com',
    consoleDomain: 'console.anthropic.com',
    keyPlaceholder: 'sk-ant-...',
    logoUrl: 'https://models.dev/logos/claude.svg',
  },
  {
    id: 'openai',
    agentId: 'codex',
    title: 'OpenAI',
    credentialPath: '/api/credentials/openai',
    consoleUrl: 'https://platform.openai.com/api-keys',
    consoleDomain: 'platform.openai.com',
    keyPlaceholder: 'sk-...',
    logoUrl: 'https://models.dev/logos/openai.svg',
  },
];

// ── Provider Logo ───────────────────────────────────────────────────────────

function ProviderLogo({ url, alt, className }: { url: string; alt: string; className?: string }) {
  return <img src={url} alt={alt} className={className} draggable={false} loading="lazy" />;
}

// ── Default Model Picker ────────────────────────────────────────────────────

function DefaultModelPicker({
  selectedModelId,
  onSelect,
}: {
  selectedModelId: string;
  onSelect: (model: ModelEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0]!;
  const selectedAgent = AGENTS.find((a) => a.id === selectedModel.agentId) ?? AGENTS[0]!;

  const activeAgentId = hoveredAgent ?? selectedAgent.id;
  const activeModels = MODELS.filter((m) => m.agentId === activeAgentId);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setHoveredAgent(null); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
          <ProviderLogo url={`https://models.dev/logos/${selectedAgent.logoId}.svg`} alt={selectedAgent.label} className="w-4 h-4 dark:invert" />
          <span className="text-sm font-medium text-foreground">
            {selectedAgent.label}: {selectedModel.label}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 overflow-hidden" sideOffset={4}>
        <div className="flex w-[400px]">
          {/* Agent list */}
          <div className="w-[150px] shrink-0 border-r border-border/40 py-1 px-1">
            {AGENTS.map((agent) => {
              const isActive = activeAgentId === agent.id;
              return (
                <button
                  key={agent.id}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isActive ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                >
                  <ProviderLogo url={`https://models.dev/logos/${agent.logoId}.svg`} alt={agent.label} className="w-4 h-4 dark:invert" />
                  <span className="font-medium text-foreground flex-1 text-left truncate">{agent.label}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
          {/* Models */}
          <div className="flex-1 min-w-0 overflow-y-auto max-h-[300px] py-1 px-1" style={{ scrollbarWidth: 'thin' }}>
            {activeModels.map((model) => {
              const isSelected = model.id === selectedModelId;
              return (
                <button
                  key={model.id}
                  onClick={() => { onSelect(model); setOpen(false); setHoveredAgent(null); }}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                    isSelected ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-sm font-medium text-foreground">{model.label}</span>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{model.description}</p>
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

// ── API Key Row ─────────────────────────────────────────────────────────────

function ApiKeyRow({ config }: { config: ProviderConfig }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: credStatus, refetch, isLoading } = useQuery({
    queryKey: ['credentials', config.id],
    queryFn: () => apiGet<CredentialStatus>(config.credentialPath),
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (key: string) =>
      apiPost<CredentialStatus>(`${config.credentialPath}/api-key`, { apiKey: key }),
    onSuccess: () => {
      setApiKey('');
      setError(null);
      void refetch();
    },
    onError: (err: Error) => setError(err.message ?? 'Failed to save'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiDelete<{ deleted: boolean }>(config.credentialPath),
    onSuccess: () => void refetch(),
  });

  const isConnected = credStatus?.connected === true;
  const isMutating = saveMutation.isPending || disconnectMutation.isPending;

  return (
    <div className="flex items-start gap-4 py-4 border-b border-border/50 last:border-0">
      {/* Provider info */}
      <div className="flex items-center gap-3 w-[140px] shrink-0 pt-1">
        <ProviderLogo url={config.logoUrl} alt={config.title} className="w-5 h-5 dark:invert" />
        <div>
          <p className="text-sm font-medium text-foreground">{config.title}</p>
          {isLoading ? (
            <div className="h-3 w-16 rounded bg-muted animate-pulse mt-1" />
          ) : isConnected ? (
            <p className="text-[11px] text-status-success">Connected</p>
          ) : (
            <p className="text-[11px] text-muted-foreground/60">Not connected</p>
          )}
        </div>
      </div>

      {/* Key input / status */}
      <div className="flex-1 min-w-0">
        {isConnected ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              API key saved
              {credStatus?.source === 'api_key' && ' (direct key)'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
              onClick={() => disconnectMutation.mutate()}
              disabled={isMutating}
            >
              {disconnectMutation.isPending ? 'Removing...' : 'Remove'}
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = apiKey.trim();
              if (!trimmed) return;
              saveMutation.mutate(trimmed);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder={config.keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="pr-9 h-8 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-8"
              disabled={!apiKey.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </form>
        )}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        {!isConnected && (
          <p className="text-[11px] text-muted-foreground/50 mt-1.5">
            Get your key from{' '}
            <a
              href={config.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/70 underline underline-offset-2 hover:text-primary"
            >
              {config.consoleDomain}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ModelsPage() {
  const [defaultModelId, setDefaultModelId] = useState('claude-opus-4-6');

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Models</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage models and their settings
        </p>
      </div>

      {/* Default Agent/Model */}
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

      {/* API Keys */}
      <section>
        <h2 className="text-sm font-medium text-foreground mb-1">API Keys</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Enter API keys for each provider to enable their models.
        </p>
        <div className="rounded-lg border border-border bg-card p-4">
          {PROVIDER_CONFIGS.map((config) => (
            <ApiKeyRow key={config.id} config={config} />
          ))}
        </div>
      </section>
    </div>
  );
}
