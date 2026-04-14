import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from 'convex/react';
import { useNavigate } from '@tanstack/react-router';
import type { ExecutionRuntime } from '@agent-center/shared';
import { api as controlPlaneApi } from '@agent-center/control-plane/api';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { apiGet } from '@/lib/api-client';
import { useControlPlaneEnabled } from '@/contexts/convex-context';
import { getSelfHostedConnectorConfig } from '@/lib/execution-connectors';
import { toast } from 'sonner';

// ── Provider Logo ───────────────────────────────────────────────────────────

function ProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  return (
    <img
      src={`https://models.dev/logos/${provider}.svg`}
      alt={provider}
      className={className}
      draggable={false}
      loading="lazy"
    />
  );
}

// ── Agent & Model Data ──────────────────────────────────────────────────────

export interface ModelEntry {
  id: string;
  agentId: string;
  label: string;
  description: string;
  context: string;
  speed: 'Fast' | 'Moderate' | 'Slow';
  reasoningEffortLevels?: ReadonlyArray<{
    value: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
    label: string;
    isDefault?: boolean;
  }>;
  supportsThinkingToggle?: boolean;
  isDefault?: boolean;
}

export interface AgentEntry {
  id: string;
  label: string;
  logoId: string;
  credentialPath: string;
}

export type AgentReasoningEffort =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultrathink';

export const AGENTS: AgentEntry[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    logoId: 'claude',
    credentialPath: '/api/credentials/claude',
  },
  {
    id: 'codex',
    label: 'Codex',
    logoId: 'openai',
    credentialPath: '/api/credentials/openai',
  },
];

const DEFAULT_MODEL_BY_AGENT: Record<string, string> = {
  claude: 'claude-opus-4-6',
  codex: 'gpt-5.4',
};

const DEFAULT_REASONING_EFFORT_BY_AGENT: Partial<Record<AgentEntry['id'], AgentReasoningEffort>> = {
  claude: 'high',
  codex: 'high',
};

export const MODELS: ModelEntry[] = [
  // ── Claude Code ──
  {
    id: 'claude-opus-4-6',
    agentId: 'claude',
    label: 'Claude Opus 4.6',
    description: 'Most capable model for complex reasoning',
    context: '1M',
    speed: 'Moderate',
    reasoningEffortLevels: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High', isDefault: true },
      { value: 'max', label: 'Max' },
      { value: 'ultrathink', label: 'Ultrathink' },
    ],
    isDefault: true,
  },
  {
    id: 'claude-sonnet-4-6',
    agentId: 'claude',
    label: 'Claude Sonnet 4.6',
    description: 'Balanced speed and intelligence',
    context: '200K',
    speed: 'Fast',
    reasoningEffortLevels: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High', isDefault: true },
      { value: 'ultrathink', label: 'Ultrathink' },
    ],
  },
  {
    id: 'claude-opus-4-5',
    agentId: 'claude',
    label: 'Claude Opus 4.5',
    description: 'Previous-gen flagship reasoning',
    context: '200K',
    speed: 'Moderate',
    reasoningEffortLevels: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High', isDefault: true },
      { value: 'max', label: 'Max' },
    ],
  },
  {
    id: 'claude-haiku-4-5',
    agentId: 'claude',
    label: 'Claude Haiku 4.5',
    description: 'Fastest Claude for simple tasks',
    context: '200K',
    speed: 'Fast',
    supportsThinkingToggle: true,
  },
  // ── Codex ──
  {
    id: 'gpt-5.4',
    agentId: 'codex',
    label: 'GPT-5.4',
    description: 'Latest frontier model',
    context: '1M',
    speed: 'Moderate',
    reasoningEffortLevels: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High', isDefault: true },
      { value: 'xhigh', label: 'Extra High' },
    ],
    isDefault: true,
  },
  {
    id: 'gpt-5.4-mini',
    agentId: 'codex',
    label: 'GPT-5.4 Mini',
    description: 'Compact and cost-efficient',
    context: '128K',
    speed: 'Fast',
    reasoningEffortLevels: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium', isDefault: true },
      { value: 'high', label: 'High' },
    ],
  },
  {
    id: 'gpt-5.3-codex',
    agentId: 'codex',
    label: 'GPT-5.3 Codex',
    description: 'Optimized for code generation',
    context: '192K',
    speed: 'Fast',
    reasoningEffortLevels: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium', isDefault: true },
      { value: 'high', label: 'High' },
    ],
  },
  {
    id: 'o3',
    agentId: 'codex',
    label: 'o3',
    description: 'Advanced reasoning model',
    context: '200K',
    speed: 'Slow',
    reasoningEffortLevels: [
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High', isDefault: true },
      { value: 'xhigh', label: 'Extra High' },
    ],
  },
];

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

interface AttachedFile {
  id: string;
  attachmentId?: string;
  contentType: string;
  name: string;
  previewUrl?: string;
  status: 'uploading' | 'uploaded' | 'error';
  size: string;
  type: 'pdf' | 'image' | 'file';
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
    agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
    agentThinkingEnabled?: boolean;
    branch?: string;
    repoConnectionId?: string | null;
    sandboxMode?: SandboxMode;
  };
  onConfigChange?: (config: {
    agentProvider: string;
    agentModel: string;
    agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
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
  kind: 'lightweight' | 'full_sandbox' | 'self_hosted';
}

interface CredentialStatus {
  connected: boolean;
  source: 'api_key' | 'oauth' | null;
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
  const [open, setOpen] = useState(false);

  const { data: rawRepos = [] } = useQuery({
    queryKey: ['repo-connections'],
    queryFn: () => apiGet<RepoConnection[]>('/api/repo-connections'),
    staleTime: 60_000,
  });
  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/workspaces'),
    staleTime: 60_000,
  });

  const repos = rawRepos;
  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  const selected = repos.find((r) => r.id === selectedRepoId);
  const hasRepos = repos.length > 0;
  const displayLabel = selected
    ? `${selected.owner}/${selected.repo}${workspaceNames.get(selected.workspaceId) ? ` · ${workspaceNames.get(selected.workspaceId)}` : ''}`
    : 'No repo';

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors ${
            disabled
              ? 'text-muted-foreground/40 cursor-default'
              : selected
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer'
                : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 cursor-pointer'
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline max-w-[140px] truncate">{displayLabel}</span>
          {!disabled && <ChevronDown className="w-3 h-3 opacity-50" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1" sideOffset={8}>
        {repos.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <FolderGit2 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground mb-2">No repositories connected</p>
            <button
              onClick={() => {
                setOpen(false);
                navigate({ to: '/settings/repositories' });
              }}
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              Connect in Settings
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                selectedRepoId === null ? 'bg-accent' : 'hover:bg-muted/50'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="truncate">No repository</span>
              {selectedRepoId === null && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
            </button>
            <div className="my-1 h-px bg-border/60" />
            {repos.map((repo) => {
              const isSelected = repo.id === selectedRepoId;
              return (
                <button
                  key={repo.id}
                  onClick={() => {
                    onSelect(repo);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                    isSelected ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                >
                  <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{repo.owner}/{repo.repo}</span>
                    {workspaceNames.get(repo.workspaceId) && (
                      <span className="block truncate text-[11px] text-muted-foreground/60">
                        {workspaceNames.get(repo.workspaceId)}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                </button>
              );
            })}
            <div className="my-1 h-px bg-border/60" />
            <button
              onClick={() => {
                setOpen(false);
                navigate({ to: '/settings/repositories' });
              }}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 text-sm rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Manage repositories</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Model selector ───────────────────────────────────────────────────────────

function ModelSelector({
  selectedModelId,
  onSelect,
}: {
  selectedModelId: string;
  onSelect: (model: ModelEntry) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0]!;
  const selectedAgent = AGENTS.find((agent) => agent.id === selectedModel.agentId) ?? AGENTS[0]!;
  const activeAgentId = hoveredAgent ?? selectedAgent.id;
  const activeModels = MODELS.filter((model) => model.agentId === activeAgentId);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setHoveredAgent(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors hover:bg-muted/80 cursor-pointer text-muted-foreground hover:text-foreground">
          <ProviderLogo provider={selectedAgent.logoId} className="w-3.5 h-3.5 dark:invert" />
          <span className="hidden sm:inline">{selectedModel.label}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-sm:w-[calc(100vw-2rem)] p-0 overflow-hidden" sideOffset={8}>
        <div className="flex">
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
                  <ProviderLogo provider={agent.logoId} className="w-4 h-4 dark:invert" />
                  <span className="font-medium text-foreground flex-1 text-left truncate">{agent.label}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto max-h-[320px] py-1 px-1" style={{ scrollbarWidth: 'thin' }}>
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
                    isSelected ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{model.label}</span>
                      <span className="text-[10px] text-muted-foreground/50 font-mono">{model.context}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{model.description}</p>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
            <div className="border-t border-border/40 pt-2 px-0.5 mt-1">
              <button
                onClick={() => {
                  setOpen(false);
                  setHoveredAgent(null);
                  navigate({ to: '/settings/models' });
                }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <Settings className="w-3 h-3" />
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
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
  thinkingEnabled?: boolean;
  onReasoningEffortChange: (value: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink') => void;
  onThinkingEnabledChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedEffort = reasoningEffort ?? getDefaultReasoningEffort(model);

  if ((!model.reasoningEffortLevels || model.reasoningEffortLevels.length === 0) && !model.supportsThinkingToggle) {
    return null;
  }

  const triggerLabel = model.reasoningEffortLevels?.length
    ? model.reasoningEffortLevels.find((option) => option.value === selectedEffort)?.label ?? 'Reasoning'
    : thinkingEnabled === false
      ? 'Thinking off'
      : 'Thinking on';

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
                  selectedEffort === option.value ? 'bg-accent' : 'hover:bg-muted/50'
                }`}
              >
                <span>
                  {option.label}
                  {option.isDefault ? ' (default)' : ''}
                </span>
                {selectedEffort === option.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
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
              { label: 'On (default)', value: true },
              { label: 'Off', value: false },
            ].map((option) => (
              <button
                key={String(option.value)}
                onClick={() => {
                  onThinkingEnabledChange(option.value);
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2.5 w-full px-2.5 py-2 text-sm rounded-md transition-colors cursor-pointer ${
                  (thinkingEnabled ?? true) === option.value ? 'bg-accent' : 'hover:bg-muted/50'
                }`}
              >
                <span>{option.label}</span>
                {(thinkingEnabled ?? true) === option.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
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

  useEffect(() => { setInput(branch); }, [branch]);

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
              ? 'text-muted-foreground/40 cursor-default'
              : 'hover:bg-muted/80 cursor-pointer text-muted-foreground hover:text-foreground'
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
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSelect(input.trim() || 'main');
              }
            }}
            placeholder="Branch name..."
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <button
            onClick={() => handleSelect('main')}
            className={`flex items-center justify-between w-full px-2.5 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
              branch === 'main' ? 'bg-accent' : 'hover:bg-muted/50'
            }`}
          >
            <span>main</span>
            {branch === 'main' && <Check className="w-3.5 h-3.5 text-primary" />}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Sandbox mode selector ────────────────────────────────────────────────────

export type SandboxMode = 'local' | 'cloud_light' | 'cloud_full' | 'self_hosted';

const LAUNCH_READY_SANDBOX_MODES = new Set<SandboxMode>(['local']);

function isSandboxMode(value: string | null): value is SandboxMode {
  return value === 'local' || value === 'cloud_light' || value === 'cloud_full' || value === 'self_hosted';
}

function isLaunchReadySandboxMode(mode: SandboxMode) {
  return LAUNCH_READY_SANDBOX_MODES.has(mode);
}

export function runtimeForSandboxMode(mode: SandboxMode): ExecutionRuntime {
  switch (mode) {
    case 'cloud_light':
      return {
        target: 'cloud',
        provider: 'convex_bash',
        sandboxProfile: 'lightweight',
        idlePolicy: 'sleep',
        resumeOnActivity: true,
      };
    case 'cloud_full':
      return {
        target: 'cloud',
        provider: 'agent_os',
        sandboxProfile: 'full',
        idlePolicy: 'sleep',
        resumeOnActivity: true,
      };
    case 'self_hosted':
      return {
        target: 'self_hosted',
        provider: 'self_hosted_runner',
        sandboxProfile: 'full',
        idlePolicy: 'retain',
        resumeOnActivity: true,
      };
    case 'local':
    default:
      return {
        target: 'local',
        provider: 'legacy_local',
        sandboxProfile: 'none',
        idlePolicy: 'retain',
      };
  }
}

export function sandboxModeForProviderKey(key: string): SandboxMode {
  switch (key) {
    case 'convex_bash':
      return 'cloud_light';
    case 'agent_os':
      return 'cloud_full';
    case 'self_hosted_runner':
      return 'self_hosted';
    default:
      return 'local';
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
    controlPlaneEnabled ? {} : 'skip',
  ) as RuntimeProviderRecord[] | undefined;
  const controlPlaneWorkspaces = useConvexQuery(
    controlPlaneApi.workspaces.list,
    controlPlaneEnabled ? {} : 'skip',
  ) as { _id: string; name: string; slug: string }[] | undefined;

  const selfHostedConnector = getSelfHostedConnectorConfig();
  const fallbackOptions: { value: SandboxMode; label: string; icon: React.ElementType; desc: string; disabled?: boolean }[] = [
    { value: 'local', label: 'Local', icon: Monitor, desc: 'Runs through the current built-in backend' },
    {
      value: 'cloud_light',
      label: 'Convex Bash',
      icon: Cloud,
      desc: 'Coming soon: cloud runtime is not launch-ready yet',
      disabled: true,
    },
    {
      value: 'cloud_full',
      label: 'AgentOS Full',
      icon: Cloud,
      desc: 'Coming soon: full cloud sandbox is not launch-ready yet',
      disabled: true,
    },
    {
      value: 'self_hosted',
      label: selfHostedConnector?.label ?? 'Self-hosted',
      icon: Settings,
      desc: selfHostedConnector
        ? `${selfHostedConnector.baseUrl} (not launch-ready yet)`
        : 'Configure a connector in Settings -> Workspace',
      disabled: true,
    },
  ];

  const options = runtimeProviders && runtimeProviders.length > 0
    ? [
        fallbackOptions[0]!,
        ...runtimeProviders
          .filter((provider) => provider.key !== 'legacy_local')
          .map((provider) => ({
          value: sandboxModeForProviderKey(provider.key),
          label:
            provider.key === 'self_hosted_runner'
              ? selfHostedConnector?.label ?? provider.name
              : provider.name,
          icon: provider.kind === 'self_hosted' ? Settings : provider.kind === 'full_sandbox' ? Cloud : Monitor,
          desc:
            provider.key === 'self_hosted_runner' && !selfHostedConnector
              ? 'Configure a connector in Settings -> Workspace'
              : `${provider.description ?? 'Control plane runtime'} (not launch-ready yet)`,
          disabled: true,
        })),
      ]
    : fallbackOptions;

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
                  ? 'opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'bg-accent'
                    : 'hover:bg-muted/50'
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
            navigate({ to: '/settings/workspace' });
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

function FileTypeIcon({ type }: { type: AttachedFile['type'] }) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
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
    defaultConfig !== undefined && Object.prototype.hasOwnProperty.call(defaultConfig, 'repoConnectionId');
  const [value, setValue] = useState(defaultValue ?? '');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(() =>
    defaultConfig?.agentModel ?? localStorage.getItem('ac_default_model') ?? 'claude-opus-4-6'
  );
  const [reasoningEffort, setReasoningEffort] = useState<
    'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink' | undefined
  >(() => defaultConfig?.agentReasoningEffort);
  const [thinkingEnabled, setThinkingEnabled] = useState<boolean | undefined>(
    () => defaultConfig?.agentThinkingEnabled,
  );
  const [branch, setBranch] = useState(defaultConfig?.branch ?? 'main');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(() =>
    hasDefaultRepoConfig
      ? (defaultConfig?.repoConnectionId ?? null)
      : localStorage.getItem('ac_selected_repo')
  );
  const [selectedRepo, setSelectedRepo] = useState<RepoConnection | null>(null);
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>(() => {
    if (defaultConfig?.sandboxMode) {
      return isLaunchReadySandboxMode(defaultConfig.sandboxMode) ? defaultConfig.sandboxMode : 'local';
    }
    const stored = localStorage.getItem('ac_sandbox_mode');
    return isSandboxMode(stored) && isLaunchReadySandboxMode(stored) ? stored : 'local';
  });
  const [contextOpen, setContextOpen] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlPlaneEnabled = useControlPlaneEnabled();
  const canComposeWhileStreaming = allowInputWhileStreaming && isStreaming;
  const generateUploadUrl = useConvexMutation(controlPlaneApi.files.generateUploadUrl);
  const saveAttachment = useConvexMutation(controlPlaneApi.files.saveAttachment);
  const createControlPlaneWorkspace = useConvexMutation(controlPlaneApi.workspaces.create);
  const controlPlaneWorkspaces = useConvexQuery(
    controlPlaneApi.workspaces.list,
    controlPlaneEnabled ? {} : 'skip',
  ) as { _id: string; name: string; slug: string }[] | undefined;
  const { data: restWorkspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/workspaces'),
    staleTime: 60_000,
  });

  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0]!;
  const selectedAgent = AGENTS.find((agent) => agent.id === selectedModel.agentId) ?? AGENTS[0]!;

  const { data: credentialStatuses = {}, isLoading: isCredentialLoading } = useQuery({
    queryKey: ['prompt-credentials'],
    queryFn: async () => {
      const entries = await Promise.all(
        AGENTS.map(async (agent) => [agent.id, await apiGet<CredentialStatus>(agent.credentialPath)] as const),
      );
      return Object.fromEntries(entries) as Record<string, CredentialStatus>;
    },
    staleTime: 30_000,
  });
  const selectedCredential = credentialStatuses[selectedAgent.id];

  useEffect(() => {
    if (defaultValue !== undefined) {
      setValue(defaultValue);
      textareaRef.current?.focus();
    }
  }, [defaultValue]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);

  useEffect(() => {
    if (isCredentialLoading) return;
    if (selectedCredential?.connected !== false) return;

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
    localStorage.setItem('ac_default_model', fallbackModelId);
  }, [credentialStatuses, isCredentialLoading, selectedAgent.id, selectedCredential?.connected]);

  useEffect(() => {
    if (isLaunchReadySandboxMode(sandboxMode)) return;
    setSandboxMode('local');
    localStorage.setItem('ac_sandbox_mode', 'local');
  }, [sandboxMode]);

  const emitConfig = useCallback(
    (
      model: ModelEntry,
      b: string,
      repo: RepoConnection | null,
      mode: SandboxMode,
      repoId = repo?.id ?? selectedRepoId,
      overrides?: {
        agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
        agentThinkingEnabled?: boolean;
      },
    ) => {
      onConfigChange?.({
        agentProvider: model.agentId,
        agentModel: model.id,
        agentReasoningEffort:
          overrides?.agentReasoningEffort ?? reasoningEffort ?? getDefaultReasoningEffort(model),
        agentThinkingEnabled:
          model.supportsThinkingToggle
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

  const clearComposer = useCallback(() => {
    setValue('');
    setFiles([]);
  }, []);

  const hasContent = value.trim().length > 0 || files.length > 0;

  const isApplePlatform = useMemo(() => {
    if (typeof navigator === 'undefined') return true;
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      '';
    return /(Mac|iPhone|iPad)/i.test(platform);
  }, []);
  const primaryShortcutLabel = `${isApplePlatform ? 'Cmd' : 'Ctrl'}+Enter`;
  const steerShortcutLabel = `Shift+${primaryShortcutLabel}`;
  const shortcutHint = canComposeWhileStreaming && hasContent
    ? `Enter for newline. ${primaryShortcutLabel} queues. ${steerShortcutLabel} steers.`
    : `Enter for newline. ${primaryShortcutLabel} sends.`;

  const handleSubmit = useCallback((mode: 'send' | 'queue' | 'steer' = 'send') => {
    if (isSubmitting) return;
    if (!isCredentialLoading && selectedCredential?.connected === false) return;
    if (files.some((file) => file.status === 'uploading')) return;
    const trimmed = value.trim();
    const uploadedFiles = files.filter((file) => file.status === 'uploaded');

    if (!trimmed && uploadedFiles.length === 0) {
      if (isStreaming) {
        onStop?.();
      }
      return;
    }

    if (canComposeWhileStreaming) {
      if (mode === 'steer') {
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
  }, [canComposeWhileStreaming, clearComposer, files, isCredentialLoading, isStreaming, isSubmitting, onQueueSubmit, onSteerSubmit, onStop, onSubmit, selectedCredential?.connected, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canComposeWhileStreaming && e.shiftKey && (value.trim().length > 0 || files.length > 0)) {
        handleSubmit('steer');
        return;
      }

      handleSubmit(canComposeWhileStreaming ? 'queue' : 'send');
    }
  };

  const uploadFiles = useCallback(async (inputFiles: File[]) => {
    const imageFiles = inputFiles.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length !== inputFiles.length) {
      toast.error('Only image uploads are supported right now. Remove non-image files or paste/drop a PNG, JPG, GIF, or WebP image.');
    }

    if (imageFiles.length === 0) {
      return;
    }

    const existingKeys = new Set(files.map((file) => `${file.name}:${file.size}`));
    const uniqueImageFiles = imageFiles.filter((file) => !existingKeys.has(`${file.name}:${file.size}`));

    if (uniqueImageFiles.length !== imageFiles.length) {
      toast.error('That image is already attached. Remove the existing copy first if you want to upload it again.');
    }

    if (uniqueImageFiles.length === 0) {
      return;
    }

    if (!controlPlaneEnabled) {
      toast.error('Image upload is unavailable because Convex is not configured for this app environment.');
      return;
    }

    let workspaceId = controlPlaneWorkspaces?.[0]?._id;
    if (!workspaceId) {
      const fallbackWorkspace = restWorkspaces[0];
      if (!fallbackWorkspace) {
        toast.error('Image upload could not start because no workspace exists yet. Create or load a workspace, then try again.');
        return;
      }

      workspaceId = await createControlPlaneWorkspace({
        name: fallbackWorkspace.name,
      }) as string;
    }

    if (!workspaceId) {
      toast.error('Image upload could not start because the Convex workspace is still unavailable. Wait a moment and try again.');
      return;
    }

    const draftFiles = uniqueImageFiles.map((file) => ({
      id: crypto.randomUUID(),
      contentType: file.type || 'application/octet-stream',
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading' as const,
      size: file.size < 1024 ? `${file.size}B` : `${Math.round(file.size / 1024)}KB`,
      type: 'image' as const,
      url: null,
    }));

    setFiles((prev) => [...prev, ...draftFiles]);

    await Promise.all(
      draftFiles.map(async (draftFile, index) => {
        const file = uniqueImageFiles[index]!;

        try {
          const uploadUrl = await generateUploadUrl({});
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
          });

          if (!uploadResponse.ok) {
            const body = await uploadResponse.text().catch(() => '');
            throw new Error(
              `Image upload failed for "${file.name}" (${uploadResponse.status}). ${body || 'Retry the upload or check Convex storage health.'}`,
            );
          }

          const { storageId } = await uploadResponse.json() as { storageId: string };
          const saved = await saveAttachment({
            workspaceId: workspaceId as never,
            storageId: storageId as never,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            fileSize: file.size,
            kind: 'image',
          });

          setFiles((prev) =>
            prev.map((existing) =>
              existing.id === draftFile.id
                ? {
                    ...existing,
                    attachmentId: saved.attachmentId as string,
                    status: 'uploaded',
                    url: saved.url,
                  }
                : existing,
            ),
          );
        } catch (error) {
          setFiles((prev) =>
            prev.map((existing) =>
              existing.id === draftFile.id
                ? { ...existing, status: 'error' }
                : existing,
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
  }, [controlPlaneEnabled, controlPlaneWorkspaces, createControlPlaneWorkspace, files, generateUploadUrl, restWorkspaces, saveAttachment]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(Array.from(e.target.files || []));
    e.target.value = '';
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
    localStorage.setItem('ac_default_model', model.id);
    emitConfig(model, branch, selectedRepo, sandboxMode, undefined, {
      agentReasoningEffort: nextReasoningEffort,
      agentThinkingEnabled: nextThinkingEnabled,
    });
  };

  const handleReasoningEffortChange = (
    nextValue: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink',
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
    localStorage.setItem('ac_sandbox_mode', mode);
    emitConfig(selectedModel, branch, selectedRepo, mode);
  };

  const handleRepoSelect = (repo: RepoConnection | null) => {
    setSelectedRepo(repo);
    setSelectedRepoId(repo?.id ?? null);
    if (repo?.id) {
      localStorage.setItem('ac_selected_repo', repo.id);
    } else {
      localStorage.removeItem('ac_selected_repo');
    }
    if (repo?.defaultBranch) {
      setBranch(repo.defaultBranch);
      emitConfig(selectedModel, repo.defaultBranch, repo, sandboxMode);
    } else {
      emitConfig(selectedModel, branch, repo, sandboxMode);
    }
  };

  const hasProviderCredentials = selectedCredential?.connected !== false;
  const hasPendingUploads = files.some((file) => file.status === 'uploading');

  const resolvedPlaceholder =
    placeholder ||
    (compact
      ? 'Send a message...'
      : 'Describe what you want to build...');
  const providerNotice =
    !isCredentialLoading && !hasProviderCredentials
      ? `${selectedAgent.label} is not connected. Add credentials in Settings -> Models before starting a run.`
      : null;

  return (
    <div className="w-full">
      <div
        className={`rounded-xl border bg-card shadow-sm overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-ring/50 ${
          isDragActive ? 'border-primary/60 ring-2 ring-primary/20' : 'border-border'
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
                {file.type === 'image' && (file.url || file.previewUrl) ? (
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
                    {file.status === 'uploading'
                      ? 'Uploading...'
                      : file.status === 'error'
                        ? 'Upload failed'
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
          onFocus={() => setIsComposerFocused(true)}
          onBlur={() => setIsComposerFocused(false)}
          onPaste={async (event) => {
            const pastedFiles = Array.from(event.clipboardData.files || []).filter((file) =>
              file.type.startsWith('image/'),
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
            ${compact ? 'min-h-[44px]' : 'min-h-[100px]'}
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

            <BranchSelector
              branch={branch}
              onSelect={handleBranchSelect}
              disabled={lockConfig}
            />

            <div className="w-px h-4 bg-border/50" />

            <ModelSelector
              selectedModelId={selectedModelId}
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

            <SandboxSelector
              mode={sandboxMode}
              onSelect={handleSandboxMode}
            />
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
                onClick={() => handleSubmit('steer')}
                disabled={isSubmitting || !hasProviderCredentials || hasPendingUploads}
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
                onClick={() => handleSubmit(canComposeWhileStreaming ? 'queue' : 'send')}
                disabled={
                  (isStreaming && !canComposeWhileStreaming)
                    ? true
                    : (!hasContent && !isStreaming) || isSubmitting || !hasProviderCredentials || hasPendingUploads
                }
                size="icon"
                className="h-7 w-7 rounded-full ml-1"
                title={
                  canComposeWhileStreaming
                    ? (hasContent ? `Queue follow-up (${primaryShortcutLabel})` : `Stop current run (${primaryShortcutLabel})`)
                    : isStreaming
                      ? 'Stop'
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
        {(isComposerFocused || hasContent || isStreaming) && !providerNotice && (
          <div className="flex justify-end px-4 pb-2">
            <p className="text-[11px] text-muted-foreground/65">{shortcutHint}</p>
          </div>
        )}
        {providerNotice && (
          <div className="px-4 pb-3 text-[11px] text-amber-600">
            {providerNotice}
          </div>
        )}
      </div>
    </div>
  );
}
