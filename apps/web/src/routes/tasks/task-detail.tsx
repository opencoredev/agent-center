import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  GitBranch,
  Loader2,
  XCircle,
  Bot,
  User,
  Square,
  Copy,
  Check,
  AlertTriangle,
  Clock3,
  CornerUpRight,
  Trash2,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import 'streamdown/styles.css';
import type { ExecutionRuntime } from '@agent-center/shared';
import { apiGet, apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  useReasoning,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { AGENTS, MODELS, PromptBox, sandboxModeForProviderKey, type SandboxMode } from '@/components/chat/prompt-box';
import { ZERO_ENABLED } from '@/hooks/use-zero';
import { useTaskDetail, useRunEvents } from '@/hooks/use-zero-queries';
import { useRunStream, type RunEvent } from '@/hooks/use-run-stream';

// ── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  workspaceId: string;
  projectId: string | null;
  repoConnectionId: string | null;
  title: string;
  prompt: string;
  status: string;
  metadata: Record<string, unknown>;
  config: {
    agentProvider?: string;
    agentModel?: string;
    agentPrompt?: string;
    agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
    agentThinkingEnabled?: boolean;
    runtime?: ExecutionRuntime;
  };
  sandboxSize: string;
  permissionMode: string;
  baseBranch: string | null;
  branchName: string | null;
  createdAt: string | number;
  updatedAt: string | number;
}

interface Run {
  id: string;
  taskId: string;
  repoConnectionId: string | null;
  status: string;
  attempt: number;
  prompt: string;
  startedAt: string | number | null;
  completedAt: string | number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  config: {
    agentProvider?: string;
    agentModel?: string;
    agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
    agentThinkingEnabled?: boolean;
    runtime?: ExecutionRuntime;
  };
  baseBranch: string | null;
  branchName: string | null;
  sandboxSize: string;
  permissionMode: string;
  createdAt: string | number;
}

interface FollowUpConfig {
  agentProvider: string;
  agentModel: string;
  agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
  agentThinkingEnabled?: boolean;
  branch: string;
  runtime: ExecutionRuntime;
  repoConnectionId?: string;
  projectId?: string;
}

interface UploadedAttachment {
  attachmentId?: string;
  contentType: string;
  name: string;
  type: 'pdf' | 'image' | 'file';
  url?: string | null;
}

interface QueuedFollowUp {
  id: string;
  prompt: string;
  files: UploadedAttachment[];
  mode: 'queue' | 'steer';
  createdAt: string;
}

// ── Status helpers ──────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'completed' ? 'bg-status-success' :
    ['pending', 'queued', 'provisioning', 'cloning', 'running', 'in_progress'].includes(status) ? 'bg-status-warning animate-pulse' :
    status === 'failed' || status === 'error' ? 'bg-status-error' :
    status === 'cancelled' ? 'bg-muted-foreground/40' :
    'bg-muted-foreground/30';

  return <span className={`w-2.5 h-2.5 rounded-full ${color} shrink-0`} />;
}

// ── Event helpers ───────────────────────────────────────────────────────────

function getInnerType(event: RunEvent): string {
  if (event.eventType === 'run.log' && event.payload?.eventType) {
    return String(event.payload.eventType);
  }
  return event.eventType;
}

function isAssistantMessage(event: RunEvent): boolean {
  const inner = getInnerType(event);
  return inner === 'assistant_message' || inner === 'assistant.message' || inner === 'agent.message';
}

// ── Tool call block ─────────────────────────────────────────────────────────

function ToolCallBlock({ event }: { event: RunEvent }) {
  const [expanded, setExpanded] = useState(false);

  const inner = getInnerType(event);
  const Icon = inner.includes('command') || inner === 'tool_use' ? Terminal :
               inner.includes('read') || inner.includes('file') || inner.includes('write') ? FileText :
               inner.includes('clone') || inner.includes('git') ? GitBranch :
               Terminal;

  let label = event.message || '';
  if (!label && inner === 'tool_use' && event.payload?.toolName) {
    label = `${event.payload.toolName}`;
  }
  if (!label) {
    label = inner.replace(/[._]/g, ' ');
  }

  const hasPayload = event.payload && Object.keys(event.payload).length > 0;

  return (
    <div className="my-0.5">
      <button
        onClick={() => hasPayload && setExpanded(!expanded)}
        className={`flex items-center gap-2 py-1 text-sm ${
          hasPayload ? 'text-muted-foreground hover:text-foreground cursor-pointer' : 'text-muted-foreground/50 cursor-default'
        }`}
      >
        {hasPayload ? (
          expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 opacity-20 shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs truncate">{label}</span>
      </button>
      {expanded && hasPayload && (
        <div className="ml-7 mt-1 rounded-md bg-muted/50 border border-border px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {typeof event.payload === 'object' && 'output' in event.payload! ? (
            <pre className="whitespace-pre-wrap">{String(event.payload.output)}</pre>
          ) : (
            <pre className="whitespace-pre-wrap">{JSON.stringify(event.payload, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Event grouping ──────────────────────────────────────────────────────────

interface MessageBlock {
  type: 'user' | 'agent' | 'tool-group' | 'status' | 'reasoning';
  content?: string;
  attachments?: AttachmentPreview[];
  activityItems?: ActivityItem[];
  duration?: number;
  label?: string;
  isStreaming?: boolean;
  events?: RunEvent[];
  status?: string;
  timestamp: string;
}

interface ActivityItem {
  id: string;
  kind: 'status' | 'log' | 'tool';
  label: string;
  message: string;
  timestamp: string;
}

interface AttachmentPreview {
  id: string;
  kind: 'image' | 'pdf' | 'file';
  name: string;
  url: string;
}

interface PersistedUiSummaryStep {
  at?: string;
  id?: string;
  label?: string;
  message?: string;
}

interface PersistedUiSummary {
  phase?: 'setup' | 'thinking' | 'completed' | 'failed' | 'cancelled';
  thinkingCompletedAt?: string;
  thinkingStartedAt?: string;
  thinkingTimeSec?: number;
  setupSteps?: PersistedUiSummaryStep[];
  workSteps?: PersistedUiSummaryStep[];
}

/** Only these event types are shown in the conversation. Everything else is hidden. */
function isVisibleEvent(event: RunEvent): 'agent' | 'tool' | false {
  // Assistant text messages — always visible
  if (isAssistantMessage(event)) return 'agent';

  // Agent tool_use events (Read, Write, Bash, etc.)
  const inner = getInnerType(event);
  if (inner === 'tool_use') return 'tool';

  // Everything else is infrastructure noise — hide it
  return false;
}

function extractAttachments(metadata: Record<string, unknown> | undefined): AttachmentPreview[] {
  const raw = metadata?.attachments;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { id?: unknown }).id === 'string' &&
        typeof (item as { kind?: unknown }).kind === 'string' &&
        typeof (item as { name?: unknown }).name === 'string' &&
        typeof (item as { url?: unknown }).url === 'string'
      ) {
        return item as AttachmentPreview;
      }

      return null;
    })
    .filter((item): item is AttachmentPreview => item !== null);
}

function extractUiSummary(metadata: Record<string, unknown> | undefined): PersistedUiSummary | null {
  const raw = metadata?.uiSummary;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  return raw as PersistedUiSummary;
}

function extractUiSummaryItems(summary: PersistedUiSummary | null, mode: 'active' | 'completed'): ActivityItem[] {
  if (!summary) {
    return [];
  }

  const rawItems =
    mode === 'active'
      ? summary.phase === 'thinking'
        ? summary.workSteps ?? []
        : summary.setupSteps ?? []
      : summary.workSteps ?? [];

  return rawItems
    .map((item, index): ActivityItem | null => {
      if (typeof item.message !== 'string') {
        return null;
      }

      return {
        id: typeof item.id === 'string' ? item.id : `persisted-${index}`,
        kind: 'log' as const,
        label: typeof item.label === 'string' ? item.label : mode === 'active' ? 'Working' : 'Thought',
        message: item.message,
        timestamp: typeof item.at === 'string' ? item.at : new Date().toISOString(),
      };
    })
    .filter((item): item is ActivityItem => item !== null);
}

function groupEventsIntoBlocks(
  prompt: string,
  events: RunEvent[],
  taskCreatedAt: string,
  attachments: AttachmentPreview[] = [],
): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  blocks.push({ type: 'user', content: prompt, attachments, timestamp: taskCreatedAt });

  let currentToolEvents: RunEvent[] = [];

  function flushTools() {
    if (currentToolEvents.length > 0) {
      blocks.push({ type: 'tool-group', events: [...currentToolEvents], timestamp: currentToolEvents[0]!.createdAt });
      currentToolEvents = [];
    }
  }

  let lastAgentContent = '';

  for (const event of events) {
    const visibility = isVisibleEvent(event);

    if (visibility === 'agent') {
      flushTools();
      const text = event.message || '';
      // Skip duplicate consecutive agent messages (e.g. from retried sessions)
      if (text.trim() && text !== lastAgentContent) {
        blocks.push({ type: 'agent', content: text, timestamp: event.createdAt });
        lastAgentContent = text;
      }
    } else if (visibility === 'tool') {
      currentToolEvents.push(event);
    }
    // Everything else: silently skip
  }

  flushTools();
  return blocks;
}

function buildConversationBlocks(task: Task, runs: Run[], eventsByRunId: Map<string, RunEvent[]>) {
  if (runs.length === 0) {
    return groupEventsIntoBlocks(task.prompt, [], String(task.createdAt), extractAttachments(task.metadata));
  }

  return [...runs]
    .sort((left, right) => left.attempt - right.attempt)
    .flatMap((run) => {
      const runEvents = eventsByRunId.get(run.id) ?? [];
      const runBlocks = groupEventsIntoBlocks(
        run.prompt || task.prompt,
        runEvents,
        String(run.createdAt),
        extractAttachments(run.metadata),
      );
      const { setupItems, workItems } = splitActivityItems(runEvents);
      const firstAgentIndex = runBlocks.findIndex((block) => block.type === 'agent');
      const meaningfulWorkItems = workItems.filter((item) => !isLowSignalWorkItem(item));
      const persistedSummary = extractUiSummary(run.metadata);
      const persistedReasoningItems = extractUiSummaryItems(persistedSummary, firstAgentIndex === -1 ? 'active' : 'completed');
      const displayReasoningItems = persistedReasoningItems.length > 0 ? persistedReasoningItems : meaningfulWorkItems;

      const reasoningDuration = persistedSummary?.thinkingTimeSec ?? getReasoningDurationSeconds(run, runEvents);

      if (firstAgentIndex >= 0 && (displayReasoningItems.length > 0 || reasoningDuration !== undefined)) {
        const reasoningBlock: MessageBlock = {
          type: 'reasoning',
          activityItems: displayReasoningItems,
          duration: reasoningDuration,
          label: getCompletedRunLabel(reasoningDuration, displayReasoningItems),
          isStreaming: false,
          timestamp: String(run.createdAt),
        };

        runBlocks.splice(firstAgentIndex, 0, reasoningBlock);
      } else if (firstAgentIndex === -1) {
        const activeItems = persistedReasoningItems.length > 0
          ? persistedReasoningItems
          : (workItems.length > 0 ? workItems : setupItems);
        if (activeItems.length > 0) {
          runBlocks.push({
            type: 'reasoning',
            activityItems: activeItems,
            label:
              persistedSummary?.phase === 'thinking'
                ? 'Thinking...'
                : persistedSummary?.phase === 'setup'
                  ? 'Setting up...'
                  : (workItems.length > 0 ? 'Thinking...' : 'Setting up...'),
            isStreaming: true,
            timestamp: String(run.createdAt),
          });
        }
      }

      return runBlocks;
    });
}

function mergeEvents(history: RunEvent[], live: RunEvent[]) {
  const merged = new Map<string, RunEvent>();

  for (const event of history) {
    merged.set(`${event.runId}:${event.sequence}`, event);
  }

  for (const event of live) {
    merged.set(`${event.runId}:${event.sequence}`, event);
  }

  return Array.from(merged.values()).sort((left, right) => left.sequence - right.sequence);
}

function getRunErrorMessage(run: { errorMessage?: string | null } | undefined, events: RunEvent[]) {
  if (run?.errorMessage) {
    return run.errorMessage;
  }

  const failedEvent = [...events]
    .reverse()
    .find((event) => event.eventType === 'run.failed' || event.eventType === 'run.status_changed');

  return failedEvent?.message ?? null;
}

function getRunErrorGuidance(message: string | null) {
  if (!message) return null;

  if (message.includes('xcodebuild -license') || message.includes('Xcode license agreements')) {
    return 'Git failed because macOS command line tools are blocked. Run `sudo xcodebuild -license` in Terminal, then retry the task.';
  }

  if (message.includes('No Claude credentials configured')) {
    return 'Claude is not connected for this workspace. Open Settings -> Models and add Claude credentials, or switch the task to Codex.';
  }

  if (message.includes('No OpenAI credentials configured')) {
    return 'Codex is not connected for this workspace. Open Settings -> Models and connect OpenAI/Codex credentials, then retry.';
  }

  if (message.includes('Git command failed')) {
    return 'Repository setup failed before the agent could run. Check the repository settings and local git environment, then retry.';
  }

  return 'Open the logs below to inspect the failing step, then retry or change the runtime/repository configuration.';
}

function getLatestSetupMessage(events: RunEvent[]) {
  const latestStatus = [...events]
    .reverse()
    .find((event) =>
      event.eventType === 'run.status_changed' &&
      typeof event.message === 'string' &&
      event.message.trim().length > 0
    );

  return latestStatus?.message ?? null;
}

function getLatestSetupLog(events: RunEvent[]) {
  const latestLog = [...events]
    .reverse()
    .find((event) =>
      event.eventType === 'run.log' &&
      typeof event.message === 'string' &&
      event.message.trim().length > 0
    );

  return latestLog?.message ?? null;
}

function formatStructuredLogMessage(message: string | null) {
  if (!message || !message.trim().startsWith('{')) {
    if (message?.includes("branch 'main' set up to track 'origin/main'.")) {
      return 'Prepared branch main.';
    }

    if (message?.includes("Your branch is up to date with 'origin/main'.")) {
      return 'Branch is up to date.';
    }

    if (message?.includes('Run claimed by worker and marked provisioning')) {
      return 'Claimed by the worker.';
    }

    if (message?.includes('Provisioning host-local workspace')) {
      return 'Prepared the local workspace.';
    }

    if (message?.includes('Workspace created')) {
      return 'Workspace created.';
    }

    if (message?.includes('Cloning repository into local workspace')) {
      return 'Cloned repository.';
    }

    if (message?.includes("Cloning into '.'...")) {
      return 'Downloading repository files.';
    }

    if (message?.includes('Updating files:')) {
      return null;
    }

    if (message?.includes('Starting Codex agent session')) {
      return 'Started the Codex agent.';
    }

    if (message?.includes('Codex agent session started')) {
      return 'Codex session started.';
    }

    if (message?.includes('Reading additional input from stdin')) {
      return 'Sent the message to the agent.';
    }

    return message;
  }

  try {
    const parsed = JSON.parse(message) as {
      type?: string;
      item?: { type?: string; text?: string };
    };

    if (parsed.type === 'turn.started') {
      return null;
    }

    if (parsed.type === 'thread.started') {
      return null;
    }

    if (parsed.type === 'item.started' && parsed.item?.type) {
      return null;
    }

    if (parsed.type === 'item.completed' && parsed.item?.type) {
      if (parsed.item.type === 'agent_message') {
        return null;
      }

      return `${parsed.item.type.replaceAll('_', ' ')} completed.`;
    }
  } catch {
    return message;
  }

  return message;
}

function buildActivityItems(events: RunEvent[]) {
  return events
    .filter((event) =>
      event.eventType === 'run.status_changed' ||
      event.eventType === 'run.command.started' ||
      event.eventType === 'run.command.finished' ||
      event.eventType === 'run.log' ||
      getInnerType(event) === 'tool_use'
    )
    .map((event): ActivityItem | null => {
      if (event.eventType === 'run.status_changed') {
        const nextStatus = typeof event.payload?.status === 'string' ? event.payload.status : null;
        if (nextStatus === 'completed' || nextStatus === 'cancelled') {
          return null;
        }

        return {
          id: event.id,
          kind: 'status',
          label: 'Status',
          message: formatStructuredLogMessage(event.message) ?? 'Status updated',
          timestamp: event.createdAt,
        };
      }

      if (getInnerType(event) === 'tool_use') {
        return {
          id: event.id,
          kind: 'tool',
          label: 'Tool',
          message:
            formatStructuredLogMessage(event.message) ??
            (typeof event.payload?.toolName === 'string'
              ? event.payload.toolName
              : 'Tool activity'),
          timestamp: event.createdAt,
        };
      }

      const formattedMessage = formatStructuredLogMessage(event.message);
      if (!formattedMessage) {
        return null;
      }

      const ignoredFragments = [
        'Workspace retained: cleanup mode is retain',
        'Codex session completed',
        'Codex agent session completed',
        'Run completed successfully',
        'Updating files:',
      ];

      if (ignoredFragments.some((fragment) => formattedMessage.includes(fragment))) {
        return null;
      }

      const isUsefulLog =
        event.eventType === 'run.command.started' ||
        event.eventType === 'run.command.finished' ||
        formattedMessage.includes('Workspace created') ||
        formattedMessage.includes('Cloning') ||
        formattedMessage.includes('Reset branch') ||
        formattedMessage.includes('branch') ||
        formattedMessage.includes('started') ||
        formattedMessage.includes('Reading additional input');

      if (!isUsefulLog) {
        return null;
      }

      return {
        id: event.id,
        kind: 'log',
        label: event.eventType === 'run.command.started'
          ? 'Command'
          : event.eventType === 'run.command.finished'
            ? 'Command'
            : 'Log',
        message: formattedMessage,
        timestamp: event.createdAt,
      };
    })
    .filter((item): item is ActivityItem => item !== null)
    .slice(-8);
}

function getRunDurationSeconds(run: Run | undefined) {
  if (!run?.startedAt || !run.completedAt) {
    return undefined;
  }

  const started = new Date(run.startedAt).getTime();
  const completed = new Date(run.completedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    return undefined;
  }

  return Math.max(1, Math.round((completed - started) / 1000));
}

function getCompletedRunLabel(duration: number | undefined, items: ActivityItem[]) {
  const seconds = duration ?? 0;
  const hasReasoningTrace = getDisplayActivityItems(items).length > 0;

  if (seconds <= 0) {
    return hasReasoningTrace ? 'Thought briefly' : 'Responded directly';
  }

  if (hasReasoningTrace) {
    return `Thought for ${seconds} seconds`;
  }

  return `Responded in ${seconds} seconds`;
}

function isLowSignalWorkItem(item: ActivityItem) {
  return [
    'Started the Codex agent.',
    'Started the Claude agent.',
    'Codex session started.',
    'Sent the message to the agent.',
  ].some((fragment) => item.message.includes(fragment));
}

function getDisplayActivityItems(items: ActivityItem[]) {
  const filtered = items.filter((item) => !isLowSignalWorkItem(item));
  return filtered.length > 0 ? filtered : [];
}

function InlineReasoningDetails({ items }: { items: ActivityItem[] }) {
  const { isOpen } = useReasoning();
  const displayItems = getDisplayActivityItems(items);

  if (!isOpen) {
    return null;
  }

  if (displayItems.length === 0) {
    return (
      <div className="mt-3 pl-6">
        <p className="text-xs text-muted-foreground/70">
          No detailed reasoning trace was emitted for this reply. The model returned a short answer directly.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 pl-6 space-y-2">
      {displayItems.map((item, index) => (
        <ChainOfThoughtStep
          key={`${item.id}-${index}`}
          className="text-xs"
          label={item.message}
          icon={item.kind === 'tool' ? Terminal : FileText}
          status={index === displayItems.length - 1 ? 'active' : 'complete'}
        />
      ))}
    </div>
  );
}

function getAgentStartTimestamp(events: RunEvent[]) {
  const candidate = events.find((event) => {
    if (event.eventType === 'run.command.started' && event.message?.includes('agent session started')) {
      return true;
    }

    return (
      event.eventType === 'run.status_changed' &&
      (event.message?.includes('Starting Codex agent session') ||
        event.message?.includes('Starting Claude Code agent session'))
    );
  });

  return candidate ? new Date(candidate.createdAt).getTime() : null;
}

function getReasoningDurationSeconds(run: Run, events: RunEvent[]) {
  const start = getAgentStartTimestamp(events);
  const assistantEvent = events.find((event) => isAssistantMessage(event));
  const end = assistantEvent
    ? new Date(assistantEvent.createdAt).getTime()
    : run.completedAt
      ? new Date(run.completedAt).getTime()
      : null;

  if (!start || !end || end < start) {
    return undefined;
  }

  return Math.max(1, Math.round((end - start) / 1000));
}

function splitActivityItems(events: RunEvent[]) {
  const items = buildActivityItems(events);
  const agentStart = getAgentStartTimestamp(events);

  if (!agentStart) {
    return {
      setupItems: items,
      workItems: [] as ActivityItem[],
    };
  }

  return {
    setupItems: items.filter((item) => new Date(item.timestamp).getTime() < agentStart),
    workItems: items.filter((item) => new Date(item.timestamp).getTime() >= agentStart),
  };
}

function resolveModelPresentation(agentProvider?: string, agentModel?: string) {
  const model = MODELS.find((entry) => entry.id === agentModel);
  const agent = AGENTS.find((entry) => entry.id === (agentProvider ?? model?.agentId));

  return {
    agentLabel: agent?.label ?? agentProvider ?? 'Agent',
    logoId: agent?.logoId ?? 'openai',
    modelLabel: model?.label ?? agentModel ?? 'Unknown model',
  };
}

// ── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 rounded text-muted-foreground/30 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function queueStorageKey(taskId: string) {
  return `ac_task_queue:${taskId}`;
}

function readQueuedFollowUps(taskId: string): QueuedFollowUp[] {
  try {
    const raw = localStorage.getItem(queueStorageKey(taskId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueuedFollowUp => {
      return (
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.prompt === 'string' &&
        Array.isArray(item.files) &&
        (item.mode === 'queue' || item.mode === 'steer') &&
        typeof item.createdAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function TaskDetailPage() {
  const { taskId } = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { task, runs, isLoading, error } = useTaskDetail(taskId ?? '');
  const latestRun = runs[0];
  const [followUpConfig, setFollowUpConfig] = useState<FollowUpConfig | null>(null);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>(() =>
    taskId ? readQueuedFollowUps(taskId) : [],
  );
  const [dispatchingQueuedId, setDispatchingQueuedId] = useState<string | null>(null);
  const hasStartedRun = !!latestRun;

  const zeroEvents = useRunEvents(latestRun?.id ?? '');
  const wsStream = useRunStream(ZERO_ENABLED ? '' : (latestRun?.id ?? ''));
  const historicalRunEventQueries = useQueries({
    queries: ZERO_ENABLED
      ? []
      : runs
          .filter((run) => run.id !== latestRun?.id)
          .map((run) => ({
            queryKey: ['run-events', run.id],
            queryFn: () => apiGet<RunEvent[]>(`/api/runs/${run.id}/events`),
            enabled: !!run.id,
            staleTime: 30_000,
          })),
  });

  const events = ZERO_ENABLED
    ? zeroEvents.events
    : mergeEvents(zeroEvents.events, wsStream.events);
  const runStatus = ZERO_ENABLED ? zeroEvents.runStatus : wsStream.runStatus;
  const effectiveStatus =
    runStatus ??
    latestRun?.status ??
    (task?.status === 'pending' && !latestRun ? 'not_started' : task?.status ?? 'pending');
  const isActive = ['queued', 'provisioning', 'cloning', 'running', 'in_progress', 'paused'].includes(effectiveStatus);
  const isStreaming = ['provisioning', 'cloning', 'running', 'in_progress'].includes(effectiveStatus);
  const runErrorMessage = getRunErrorMessage(latestRun, events);
  const runErrorGuidance = getRunErrorGuidance(runErrorMessage);
  const latestSetupMessage = getLatestSetupMessage(events);
  const currentActivityItems = buildActivityItems(events);
  const pendingLabel =
    effectiveStatus === 'queued' || effectiveStatus === 'provisioning' || effectiveStatus === 'cloning'
      ? 'Setting up...'
      : 'Thinking...';
  const eventsByRunId = new Map<string, RunEvent[]>();

  for (const [index, run] of runs
    .filter((candidate) => candidate.id !== latestRun?.id)
    .entries()) {
    eventsByRunId.set(run.id, historicalRunEventQueries[index]?.data ?? []);
  }

  if (latestRun) {
    eventsByRunId.set(latestRun.id, events);
  }

  // Auto-scroll when streaming
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isStreaming]);

  useEffect(() => {
    if (!taskId) return;
    setQueuedFollowUps(readQueuedFollowUps(taskId));
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    localStorage.setItem(queueStorageKey(taskId), JSON.stringify(queuedFollowUps));
  }, [queuedFollowUps, taskId]);

  const cancelMutation = useMutation({
    mutationFn: () => apiPost(`/api/tasks/${taskId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-runs', taskId] });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => apiPost<Run>(`/api/tasks/${taskId}/retry`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-runs', taskId] });
    },
  });

  const followUpMutation = useMutation({
    mutationFn: async ({ prompt, files }: { prompt: string; files: UploadedAttachment[] }) => {
      if (!task) {
        throw new Error('Task not found');
      }

      const baseBranch = latestRun?.baseBranch ?? task.baseBranch ?? null;
      const inheritedBranch = latestRun?.branchName ?? task.branchName ?? null;
      const branchName =
        inheritedBranch && inheritedBranch !== baseBranch ? inheritedBranch : null;

      const run = await apiPost<Run>('/api/runs', {
        taskId: task.id,
        prompt,
        baseBranch,
        branchName,
        sandboxSize: task.sandboxSize as Run['sandboxSize'],
        permissionMode: task.permissionMode as Run['permissionMode'],
        config: {
          ...task.config,
          agentProvider: followUpConfig?.agentProvider ?? task.config.agentProvider,
          agentModel: followUpConfig?.agentModel ?? task.config.agentModel,
          agentReasoningEffort:
            followUpConfig?.agentReasoningEffort ?? task.config.agentReasoningEffort,
          agentThinkingEnabled:
            followUpConfig?.agentThinkingEnabled ?? task.config.agentThinkingEnabled,
          runtime: followUpConfig?.runtime ?? task.config.runtime,
          agentPrompt: prompt,
        },
        metadata: {
          attachments: files
            .filter((file) => file.attachmentId && file.url)
            .map((file) => ({
              id: file.attachmentId,
              kind: file.type,
              name: file.name,
              url: file.url,
            })),
          followUpPrompt: prompt,
          projectId: followUpConfig?.projectId ?? task.projectId,
          repoConnectionId: followUpConfig?.repoConnectionId ?? task.repoConnectionId,
        },
      });

      return { run };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-runs', taskId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const enqueueFollowUp = React.useCallback(
    (prompt: string, files: UploadedAttachment[], mode: 'queue' | 'steer' = 'queue') => {
      const nextItem: QueuedFollowUp = {
        id: crypto.randomUUID(),
        prompt,
        files,
        mode,
        createdAt: new Date().toISOString(),
      };

      setQueuedFollowUps((current) => (mode === 'steer' ? [nextItem, ...current] : [...current, nextItem]));

      if (mode === 'steer' && isActive && !cancelMutation.isPending) {
        cancelMutation.mutate();
      }
    },
    [cancelMutation, isActive],
  );

  const steerQueuedFollowUp = React.useCallback(
    (queuedId: string) => {
      setQueuedFollowUps((current) => {
        const target = current.find((item) => item.id === queuedId);
        if (!target) return current;
        const remainder = current.filter((item) => item.id !== queuedId);
        return [{ ...target, mode: 'steer' }, ...remainder];
      });

      if (isActive && !cancelMutation.isPending) {
        cancelMutation.mutate();
      }
    },
    [cancelMutation, isActive],
  );

  useEffect(() => {
    if (!task || isActive || followUpMutation.isPending || dispatchingQueuedId) {
      return;
    }

    const nextQueued = queuedFollowUps[0];
    if (!nextQueued) {
      return;
    }

    setDispatchingQueuedId(nextQueued.id);

    void followUpMutation
      .mutateAsync({ prompt: nextQueued.prompt, files: nextQueued.files })
      .then(() => {
        setQueuedFollowUps((current) => current.filter((item) => item.id !== nextQueued.id));
      })
      .finally(() => {
        setDispatchingQueuedId(null);
      });
  }, [dispatchingQueuedId, followUpMutation, isActive, queuedFollowUps, task]);

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-12 border-b border-border bg-card/50 animate-pulse" />
        <div className="flex-1 p-6 space-y-4">
          <div className="h-20 rounded-lg bg-muted animate-pulse max-w-xl" />
          <div className="h-32 rounded-lg bg-muted animate-pulse max-w-2xl" />
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <XCircle className="w-8 h-8 text-destructive/40" />
        <p className="text-sm text-destructive">{error ? (error as Error).message : 'Task not found'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: '/' })}>Go home</Button>
      </div>
    );
  }

  const defaultSandboxMode: SandboxMode = task.config.runtime?.provider
    ? sandboxModeForProviderKey(task.config.runtime.provider)
    : 'local';
  const defaultBranch = latestRun?.branchName ?? task.branchName ?? latestRun?.baseBranch ?? task.baseBranch ?? 'main';
  const modelPresentation = resolveModelPresentation(
    latestRun?.config.agentProvider ?? task.config.agentProvider,
    latestRun?.config.agentModel ?? task.config.agentModel,
  );

  const blocks = buildConversationBlocks(task, runs, eventsByRunId);
  const hasAssistantReply = blocks.some((block) => block.type === 'agent');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 h-12 px-4 border-b border-border bg-card/50">
        <button
          onClick={() => navigate({ to: '/' })}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <StatusDot status={effectiveStatus} />

        <h1 className="text-sm font-medium text-foreground truncate flex-1">
          {task.title}
        </h1>

        <div className="hidden lg:flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
          <img
            src={`https://models.dev/logos/${modelPresentation.logoId}.svg`}
            alt={modelPresentation.agentLabel}
            className="h-3.5 w-3.5 dark:invert"
            draggable={false}
          />
          <span>{modelPresentation.modelLabel}</span>
        </div>

        {isActive && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            <Square className="w-3 h-3" />
            Cancel
          </Button>
        )}
        {effectiveStatus === 'failed' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? 'Retrying...' : 'Retry'}
          </Button>
        )}
        {!hasStartedRun && task.status === 'pending' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? 'Starting...' : 'Start Run'}
          </Button>
        )}
      </header>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
          {blocks.map((block, i) => {
            if (block.type === 'user') {
              return (
                <div key={`user-${i}`} className="group relative mb-4">
                  <div className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center">
                        <User className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">You</span>
                      <CopyButton content={block.content ?? ''} />
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {block.content}
                    </p>
                    {block.attachments && block.attachments.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2 max-w-[420px]">
                        {block.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            onClick={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}
                            className="group overflow-hidden rounded-lg border border-border/60 bg-background/60 text-left"
                          >
                            {attachment.kind === 'image' ? (
                              <img
                                src={attachment.url}
                                alt={attachment.name}
                                className="h-28 w-full object-cover transition-transform group-hover:scale-[1.02]"
                              />
                            ) : (
                              <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                                {attachment.name}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (block.type === 'agent') {
              return (
                <div key={`agent-${i}`} className="group relative mb-5 pl-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center">
                      <Bot className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Agent</span>
                    <CopyButton content={block.content ?? ''} />
                  </div>
                  <div className="streamdown-content text-sm text-foreground">
                    <Streamdown
                      plugins={{ code }}
                      mode="static"
                    >
                      {block.content ?? ''}
                    </Streamdown>
                  </div>
                </div>
              );
            }

            if (block.type === 'reasoning') {
              return (
                <div key={`reasoning-${i}`} className="mb-4 pl-1">
                  <Reasoning
                    className="mb-0"
                    defaultOpen={false}
                    duration={block.duration}
                    isStreaming={block.isStreaming}
                  >
                    <ReasoningTrigger
                      getThinkingMessage={() => (
                        block.isStreaming ? (
                          <Shimmer duration={1.1}>{block.label ?? 'Thinking...'}</Shimmer>
                        ) : (
                          <span>{block.label ?? getCompletedRunLabel(block.duration, block.activityItems ?? [])}</span>
                        )
                      )}
                    />
                    <ReasoningContent>
                      <InlineReasoningDetails items={block.activityItems ?? []} />
                    </ReasoningContent>
                  </Reasoning>
                </div>
              );
            }

            if (block.type === 'tool-group') {
              return (
                <div key={`tools-${i}`} className="mb-2 pl-1">
                  {block.events!.map((event, ei) => (
                    <ToolCallBlock key={event.id || ei} event={event} />
                  ))}
                </div>
              );
            }

            if (block.type === 'status') {
              return (
                <div key={`status-${i}`} className="flex items-center gap-2 py-2 text-xs text-muted-foreground/40">
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="capitalize">{(block.status ?? '').replace('_', ' ')}</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
              );
            }

            return null;
          })}

          {!hasStartedRun && task.status === 'pending' && (
            <div className="mb-4 pl-1">
              <Reasoning className="mb-0" defaultOpen={false} isStreaming>
                <ReasoningTrigger
                  getThinkingMessage={() => (
                    <Shimmer duration={1.1}>Setting up...</Shimmer>
                  )}
                />
                <ReasoningContent>
                  <InlineReasoningDetails items={currentActivityItems} />
                </ReasoningContent>
              </Reasoning>
            </div>
          )}

          {effectiveStatus === 'failed' && runErrorMessage && !hasAssistantReply && (
            <div className="group relative mb-5 pl-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-md bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Agent</span>
              </div>
              <div className="streamdown-content text-sm text-destructive">
                <Streamdown plugins={{ code }} mode="static">
                  {[runErrorMessage, runErrorGuidance].filter(Boolean).join('\n\n')}
                </Streamdown>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prompt — always visible */}
      <div className="shrink-0 border-t border-border px-4 py-3 bg-card/50">
        <div className="max-w-3xl mx-auto">
          {queuedFollowUps.length > 0 && (
            <div className="mb-3 rounded-2xl border border-border/60 bg-background/80 p-3">
              {queuedFollowUps.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 rounded-xl px-3 py-2 ${index > 0 ? 'mt-2 border-t border-border/50 pt-3' : ''}`}
                >
                  <div className="mt-1 rounded-full bg-muted p-1.5">
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.prompt}
                      </p>
                      {index === 0 && dispatchingQueuedId === item.id && (
                        <span className="text-[11px] text-muted-foreground">Sending next…</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.mode === 'steer'
                        ? 'Steer requested. This message will interrupt the current run as soon as cancellation lands.'
                        : 'Queued. This message will send automatically after the current run finishes.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {index === 0 && (
                      <Button
                        type="button"
                        size="xs"
                        variant="secondary"
                        onClick={() => steerQueuedFollowUp(item.id)}
                        disabled={item.mode === 'steer'}
                      >
                        <CornerUpRight className="h-3 w-3" />
                        Steer
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setQueuedFollowUps((current) => current.filter((queued) => queued.id !== item.id))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <PromptBox
            onSubmit={(prompt, files) => followUpMutation.mutate({ prompt, files })}
            onQueueSubmit={(prompt, files) => enqueueFollowUp(prompt, files, 'queue')}
            onSteerSubmit={(prompt, files) => enqueueFollowUp(prompt, files, 'steer')}
            defaultConfig={{
              agentModel: latestRun?.config.agentModel ?? task.config.agentModel,
              agentReasoningEffort:
                latestRun?.config.agentReasoningEffort ?? task.config.agentReasoningEffort,
              agentThinkingEnabled:
                latestRun?.config.agentThinkingEnabled ?? task.config.agentThinkingEnabled,
              branch: defaultBranch,
              repoConnectionId: task.repoConnectionId,
              sandboxMode: defaultSandboxMode,
            }}
            onConfigChange={setFollowUpConfig}
            isSubmitting={followUpMutation.isPending}
            isStreaming={isStreaming}
            onStop={() => cancelMutation.mutate()}
            allowInputWhileStreaming
            placeholder={isActive ? 'Ask for follow-up changes' : 'Send a follow-up...'}
            compact
          />
        </div>
      </div>
    </div>
  );
}
