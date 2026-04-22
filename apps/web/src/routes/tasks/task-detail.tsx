import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
  FileCode2,
  AlertTriangle,
  Clock3,
  CornerUpRight,
  Trash2,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import 'streamdown/styles.css';
import type { ExecutionRuntime } from '@agent-center/shared';
import { apiFetch, apiGet, apiPost } from '@/lib/api-client';
import { broadcastTaskSync } from '@/lib/task-sync';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  useReasoning,
} from '@/components/ai-elements/reasoning';
import { AGENTS, MODELS, PromptBox, sandboxModeForProviderKey, type SandboxMode } from '@/components/chat/prompt-box';
import { RunDiffSheet } from '@/components/tasks/run-diff-sheet';
import { ZERO_ENABLED } from '@/hooks/use-zero';
import { useTaskDetail, useRunEvents } from '@/hooks/use-zero-queries';
import { useRunStream, type RunEvent } from '@/hooks/use-run-stream';

import {
  extractPersistedAssistantDelta,
  mergeAssistantText,
  normalizeAssistantText,
} from './assistant-stream';

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
  publication?: PublicationSummary;
  config: {
    agentProvider?: string;
    agentModel?: string;
    agentPrompt?: string;
    agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
    agentThinkingEnabled?: boolean;
    prBody?: string;
    prTitle?: string;
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
  publication?: PublicationSummary;
  workspacePath?: string | null;
  config: {
    agentProvider?: string;
    agentModel?: string;
    agentReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultrathink';
    agentThinkingEnabled?: boolean;
    prBody?: string;
    prTitle?: string;
    runtime?: ExecutionRuntime;
  };
  baseBranch: string | null;
  branchName: string | null;
  sandboxSize: string;
  permissionMode: string;
  createdAt: string | number;
}

interface RunDiffPayload {
  available: boolean;
  error: string | null;
  hasChanges: boolean;
  patch: string | null;
  stats: string | null;
  statusLines: string[];
  workspacePath: string | null;
}

interface PublicationPullRequestSummary {
  body: string | null;
  draft: boolean | null;
  htmlUrl: string | null;
  id: string | null;
  number: number | null;
  state: string | null;
  title: string | null;
  url: string | null;
}

interface PublicationSummary {
  attemptedAt: string | null;
  baseBranch: string | null;
  error: string | null;
  headBranch: string | null;
  provider: string | null;
  publishedAt: string | null;
  pullRequest: PublicationPullRequestSummary | null;
  status: string;
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

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 96;
const DIFF_INLINE_BREAKPOINT = 1024;
const DIFF_PANEL_WIDTH_KEY = 'agent_center_diff_panel_width';
const DEFAULT_DIFF_PANEL_WIDTH = 520;
const MIN_DIFF_PANEL_WIDTH = 360;
const MAX_DIFF_PANEL_WIDTH = 820;

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

function useIsNarrowDiffLayout() {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < DIFF_INLINE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${DIFF_INLINE_BREAKPOINT - 1}px)`);
    const handler = (event: MediaQueryListEvent) => setIsNarrow(event.matches);

    setIsNarrow(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isNarrow;
}

function getStoredDiffPanelWidth() {
  try {
    const stored = localStorage.getItem(DIFF_PANEL_WIDTH_KEY);
    if (!stored) return DEFAULT_DIFF_PANEL_WIDTH;
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_DIFF_PANEL_WIDTH, Math.max(MIN_DIFF_PANEL_WIDTH, parsed));
    }
  } catch {
    // noop
  }

  return DEFAULT_DIFF_PANEL_WIDTH;
}

// ── Event helpers ───────────────────────────────────────────────────────────

function getInnerType(event: RunEvent): string {
  if (event.eventType === 'run.log' && event.payload?.eventType) {
    return String(event.payload.eventType);
  }
  return event.eventType;
}

function extractAssistantText(event: RunEvent): string | null {
  const payloadItem =
    event.payload && typeof event.payload.item === 'object' && event.payload.item !== null
      ? (event.payload.item as Record<string, unknown>)
      : null;

  if (
    payloadItem?.type === 'agent_message' &&
    typeof payloadItem.text === 'string' &&
    payloadItem.text.trim().length > 0
  ) {
    return payloadItem.text;
  }

  if (
    event.message &&
    ['assistant_message', 'assistant_message_delta', 'assistant.message', 'agent.message'].includes(getInnerType(event))
  ) {
    return event.message;
  }

  return null;
}

function isAssistantMessage(event: RunEvent): boolean {
  const inner = getInnerType(event);
  return (
    inner === 'assistant_message' ||
    inner === 'assistant_message_delta' ||
    inner === 'assistant.message' ||
    inner === 'agent.message' ||
    extractAssistantText(event) !== null
  );
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
  command?: string;
  output?: string | null;
  status?: 'running' | 'completed' | 'failed';
}

interface AttachmentPreview {
  id: string;
  kind: 'image' | 'pdf' | 'file';
  name: string;
  url: string;
}

interface PersistedUiSummaryStep {
  at?: string;
  command?: string | null;
  id?: string;
  label?: string;
  message?: string;
  output?: string | null;
  status?: 'running' | 'completed' | 'failed';
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

type PublicationStatus = 'idle' | 'pending' | 'creating' | 'success' | 'error';

interface PublicationState {
  actionLabel: string;
  description: string;
  errorMessage: string | null;
  prTitle: string | null;
  prUrl: string | null;
  status: PublicationStatus;
  tone: 'muted' | 'info' | 'success' | 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readPublicationRecord(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return null;
  }

  const nestedCandidates = [metadata.publication, metadata.publish, metadata.pr];
  for (const candidate of nestedCandidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  if (
    typeof metadata.publicationStatus === 'string' ||
    typeof metadata.prUrl === 'string' ||
    typeof metadata.prTitle === 'string' ||
    typeof metadata.publicationError === 'string'
  ) {
    return metadata;
  }

  return null;
}

function normalizePublicationStatus(value: string | null | undefined, hasPrUrl: boolean): PublicationStatus {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return hasPrUrl ? 'success' : 'idle';
  }

  if (['pending', 'queued', 'requested'].includes(normalized)) {
    return 'pending';
  }

  if (['creating', 'publishing', 'opening', 'in_progress'].includes(normalized)) {
    return 'creating';
  }

  if (['success', 'completed', 'opened', 'published'].includes(normalized)) {
    return 'success';
  }

  if (['error', 'failed'].includes(normalized)) {
    return 'error';
  }

  return hasPrUrl ? 'success' : 'idle';
}

function derivePublicationState(
  task: Task,
  latestRun: Run | undefined,
  events: RunEvent[],
  isPublishing: boolean,
): PublicationState {
  const explicitPublication = latestRun?.publication ?? task.publication ?? null;
  const runRecord = readPublicationRecord(latestRun?.metadata);
  const taskRecord = readPublicationRecord(task.metadata);
  const metadataRecord = runRecord ?? taskRecord;
  const latestPrEvent = [...events].reverse().find((event) => event.eventType === 'git.pr.opened');
  const eventPayload = isRecord(latestPrEvent?.payload) ? latestPrEvent.payload : null;

  const prUrl =
    explicitPublication?.pullRequest?.htmlUrl ??
    explicitPublication?.pullRequest?.url ??
    readString(metadataRecord?.prUrl) ??
    readString(metadataRecord?.url) ??
    readString(metadataRecord?.htmlUrl) ??
    readString(eventPayload?.prUrl) ??
    readString(eventPayload?.url) ??
    readString(eventPayload?.htmlUrl);

  const prTitle =
    explicitPublication?.pullRequest?.title ??
    readString(metadataRecord?.prTitle) ??
    readString(metadataRecord?.title) ??
    latestRun?.config.prTitle ??
    task.config.prTitle ??
    null;

  const errorMessage =
    explicitPublication?.error ??
    readString(metadataRecord?.errorMessage) ??
    readString(metadataRecord?.error) ??
    readString(metadataRecord?.publicationError) ??
    null;

  const metadataStatus = normalizePublicationStatus(
    explicitPublication?.status ??
    readString(metadataRecord?.status) ?? readString(metadataRecord?.publicationStatus),
    Boolean(prUrl),
  );

  const status: PublicationStatus =
    isPublishing
      ? 'creating'
      : latestPrEvent
        ? 'success'
        : metadataStatus;

  if (status === 'success') {
    return {
      actionLabel: prUrl ? 'View Draft PR' : 'Draft PR Opened',
      description: prUrl
        ? 'The run has already published a draft pull request. Open it in GitHub to review or keep iterating here.'
        : 'The run published a draft pull request. Publication details should appear here once the backend returns them.',
      errorMessage: null,
      prTitle,
      prUrl,
      status,
      tone: 'success',
    };
  }

  if (status === 'error') {
    return {
      actionLabel: 'Retry Draft PR',
      description:
        'The task finished with changes, but opening the draft PR did not succeed. You can retry once publication is available.',
      errorMessage,
      prTitle,
      prUrl,
      status,
      tone: 'error',
    };
  }

  if (status === 'pending' || status === 'creating') {
    return {
      actionLabel: 'Opening Draft PR…',
      description:
        'Agent Center is preparing the branch and draft pull request. This card will update as soon as the backend reports publication progress.',
      errorMessage: null,
      prTitle,
      prUrl,
      status,
      tone: 'info',
    };
  }

  return {
    actionLabel: 'Open Draft PR',
    description:
      'Task complete, want to open a draft PR? We will use the agent’s suggested title and description when the backend provides them.',
    errorMessage: null,
    prTitle,
    prUrl: null,
    status: 'idle',
    tone: 'muted',
  };
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
        command: typeof item.command === 'string' ? item.command : undefined,
        output: typeof item.output === 'string' ? item.output : null,
        status:
          item.status === 'running' || item.status === 'completed' || item.status === 'failed'
            ? item.status
            : undefined,
      };
    })
    .filter((item): item is ActivityItem => item !== null);
}

function isProgressUpdateItem(item: ActivityItem) {
  return item.label === 'Update';
}

function getRunStateLabel(
  run: Run,
  summary: PersistedUiSummary | null,
  items: ActivityItem[],
) {
  const hasCancellationRequest = items.some((item) => item.message.includes('Cancellation requested'));

  if (run.status === 'cancelled' || summary?.phase === 'cancelled') {
    return 'Cancelled';
  }

  if (hasCancellationRequest) {
    return 'Cancelling...';
  }

  if (run.status === 'failed' || summary?.phase === 'failed') {
    return 'Failed';
  }

  return null;
}

function groupEventsIntoBlocks(
  prompt: string,
  events: RunEvent[],
  taskCreatedAt: string,
  attachments: AttachmentPreview[] = [],
  options?: { includeAssistantMessages?: boolean },
): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  blocks.push({ type: 'user', content: prompt, attachments, timestamp: taskCreatedAt });

  let currentToolEvents: RunEvent[] = [];
  let pendingAssistantStream = '';
  let pendingAssistantTimestamp: string | null = null;

  function flushTools() {
    if (currentToolEvents.length > 0) {
      blocks.push({ type: 'tool-group', events: [...currentToolEvents], timestamp: currentToolEvents[0]!.createdAt });
      currentToolEvents = [];
    }
  }

  function flushPendingAssistant() {
    const text =
      normalizeAssistantText(pendingAssistantStream).length > 0
        ? normalizeAssistantText(pendingAssistantStream)
        : null;
    if (!text) {
      pendingAssistantStream = '';
      pendingAssistantTimestamp = null;
      return;
    }

    if (normalizeAssistantText(text) !== normalizeAssistantText(lastAgentContent)) {
      blocks.push({
        type: 'agent',
        content: text,
        timestamp: pendingAssistantTimestamp ?? taskCreatedAt,
      });
      lastAgentContent = text;
    }

    pendingAssistantStream = '';
    pendingAssistantTimestamp = null;
  }

  let lastAgentContent = '';

  for (const event of events) {
    const visibility = isVisibleEvent(event);
    const assistantDelta = extractPersistedAssistantDelta(event);

    if (assistantDelta) {
      if (options?.includeAssistantMessages === false) {
        continue;
      }
      flushTools();
      if (pendingAssistantTimestamp === null) {
        pendingAssistantTimestamp = event.createdAt;
      }
      pendingAssistantStream = mergeAssistantText(pendingAssistantStream, assistantDelta);
      continue;
    }

    if (visibility === 'agent') {
      if (options?.includeAssistantMessages === false) {
        continue;
      }
      flushTools();
      const text = extractAssistantText(event) ?? event.message ?? '';

      // Final assistant message replaces any accumulated streamed draft.
      if (normalizeAssistantText(pendingAssistantStream).length > 0) {
        const finalText = text.trim().length > 0 ? text : pendingAssistantStream;
        pendingAssistantStream = '';
        pendingAssistantTimestamp = null;

        if (normalizeAssistantText(finalText) !== normalizeAssistantText(lastAgentContent)) {
          blocks.push({ type: 'agent', content: finalText, timestamp: event.createdAt });
          lastAgentContent = finalText;
        }
        continue;
      }

      if (text.trim() && normalizeAssistantText(text) !== normalizeAssistantText(lastAgentContent)) {
        blocks.push({ type: 'agent', content: text, timestamp: event.createdAt });
        lastAgentContent = text;
      }
    } else if (visibility === 'tool') {
      flushPendingAssistant();
      currentToolEvents.push(event);
    }
    // Everything else: silently skip
  }

  flushPendingAssistant();
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
      const isRunActive = ['queued', 'provisioning', 'cloning', 'running', 'in_progress', 'paused'].includes(run.status);
      const runEvents = eventsByRunId.get(run.id) ?? [];
      const runBlocks = groupEventsIntoBlocks(
        run.prompt || task.prompt,
        runEvents,
        String(run.createdAt),
        extractAttachments(run.metadata),
        {
          includeAssistantMessages: true,
        },
      );
      const assistantBlocks = runBlocks.filter(
        (block): block is MessageBlock & { content: string } =>
          block.type === 'agent' && typeof block.content === 'string' && block.content.trim().length > 0,
      );
      const assistantContent =
        assistantBlocks.length > 0
          ? assistantBlocks.map((block) => block.content.trim()).join('\n\n')
          : null;
      const { setupItems, workItems } = splitActivityItems(runEvents);
      const firstAgentIndex = runBlocks.findIndex((block) => block.type === 'agent');
      const meaningfulWorkItems = workItems.filter((item) => !isLowSignalWorkItem(item));
      const persistedSummary = extractUiSummary(run.metadata);
      const reasoningMode = isRunActive || firstAgentIndex === -1 ? 'active' : 'completed';
      const persistedReasoningItems = extractUiSummaryItems(persistedSummary, reasoningMode);
      const hasActualWorkStarted = getAgentStartTimestamp(runEvents) !== null || workItems.length > 0;
      const liveReasoningItems = isRunActive
        ? (hasActualWorkStarted ? workItems : [])
        : meaningfulWorkItems.filter((item) => !isProgressUpdateItem(item));
      const displayReasoningItems =
        liveReasoningItems.length > 0 ? liveReasoningItems : persistedReasoningItems;
      const runStateLabel = getRunStateLabel(run, persistedSummary, displayReasoningItems);
      const isReasoningStreaming = isRunActive && hasActualWorkStarted;

      const reasoningDuration = persistedSummary?.thinkingTimeSec ?? getReasoningDurationSeconds(run, runEvents);

      if (
        firstAgentIndex >= 0 &&
        (displayReasoningItems.length > 0 || isRunActive)
      ) {
        const reasoningBlock: MessageBlock = {
          type: 'reasoning',
          activityItems: displayReasoningItems,
          duration: isReasoningStreaming ? undefined : reasoningDuration,
          label: runStateLabel ?? (
            isRunActive
              ? (
                !hasActualWorkStarted
                  ? 'Setting up...'
                  : 'Working...'
              )
              : getCompletedRunLabel(reasoningDuration, displayReasoningItems)
          ),
          isStreaming: isReasoningStreaming,
          timestamp: String(run.createdAt),
        };

        runBlocks.splice(firstAgentIndex, 0, reasoningBlock);
        return runBlocks;
      } else if (firstAgentIndex === -1) {
        const activeItems = hasActualWorkStarted
          ? (workItems.length > 0 ? workItems : persistedReasoningItems)
          : [];
        if (activeItems.length > 0 || isRunActive) {
          runBlocks.push({
            type: 'reasoning',
            activityItems: activeItems,
            content: assistantContent ?? undefined,
            label:
              getRunStateLabel(run, persistedSummary, activeItems) ??
              (hasActualWorkStarted
                ? 'Working...'
                : 'Setting up...'),
            isStreaming: isReasoningStreaming,
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

function compactCommandLabel(command: string | null | undefined) {
  if (!command) return null;

  const trimmed = command.trim();
  if (!trimmed) return null;

  const unwrapped = unwrapCommand(command);
  const segments = unwrapped
    .split('&&')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (segments.length === 1 && segments[0] === 'pwd') {
    return 'Checked working directory';
  }

  if (segments.length === 1 && /^ls(\s|$)/.test(segments[0]!)) {
    return 'Listed files';
  }

  if (segments.some((segment) => segment.startsWith('git status --short'))) {
    return 'Checked git status';
  }

  if (segments.some((segment) => segment.startsWith('git diff'))) {
    return 'Inspected git diff';
  }

  if (segments.some((segment) => segment.startsWith('rg --files'))) {
    return 'Listed files';
  }

  if (segments.some((segment) => segment.startsWith('rg '))) {
    return 'Searched the codebase';
  }

  if (segments.some((segment) => segment.startsWith('find '))) {
    return 'Searched the codebase';
  }

  if (segments.some((segment) => segment.startsWith('sed -n '))) {
    return 'Read files';
  }

  return unwrapped.length > 72 ? `${unwrapped.slice(0, 69)}...` : unwrapped;
}

function unwrapCommand(command: string | null | undefined) {
  if (!command) return '';

  const trimmed = command.trim();
  if (!trimmed) return '';

  const shellWrapped = trimmed.match(/^\/bin\/zsh -lc\s+([\s\S]+)$/);
  const shellBody = shellWrapped?.[1]?.trim();
  return shellBody?.replace(/^["']([\s\S]*)["']$/, '$1').trim() ?? trimmed;
}

function buildActivityItems(events: RunEvent[]) {
  const items = new Map<string, ActivityItem>();
  const standalone: ActivityItem[] = [];

  for (const event of events) {
    if (event.eventType === 'run.status_changed') {
      const nextStatus = typeof event.payload?.status === 'string' ? event.payload.status : null;
      if (nextStatus === 'completed' || nextStatus === 'cancelled') {
        continue;
      }

      const formatted = formatStructuredLogMessage(event.message);
      if (!formatted) continue;

      standalone.push({
        id: event.id,
        kind: 'status',
        label: 'Status',
        message: formatted,
        timestamp: event.createdAt,
      });
      continue;
    }

    if (getInnerType(event) === 'tool_use') {
      standalone.push({
        id: event.id,
        kind: 'tool',
        label: 'Tool',
        message:
          formatStructuredLogMessage(event.message) ??
          (typeof event.payload?.toolName === 'string' ? event.payload.toolName : 'Tool activity'),
        timestamp: event.createdAt,
      });
      continue;
    }

    const payloadItem =
      event.payload && typeof event.payload.item === 'object' && event.payload.item !== null
        ? (event.payload.item as Record<string, unknown>)
        : null;
    const payloadType = typeof event.payload?.type === 'string' ? event.payload.type : null;

    if (extractPersistedAssistantDelta(event)) {
      continue;
    }

    if (payloadItem?.type === 'command_execution') {
      const itemId = typeof payloadItem.id === 'string' ? payloadItem.id : event.id;
      const rawCommand = typeof payloadItem.command === 'string' ? payloadItem.command : null;
      const summary = compactCommandLabel(rawCommand) ?? 'Ran a command';
      const existing = items.get(itemId);

      if (payloadType === 'item.started') {
        items.set(itemId, {
          id: itemId,
          kind: 'tool',
          label: 'Command',
          message: summary,
          timestamp: event.createdAt,
          command: rawCommand ?? undefined,
          status: 'running',
        });
        continue;
      }

      if (payloadType === 'item.completed') {
        const output =
          typeof payloadItem.aggregated_output === 'string' && payloadItem.aggregated_output.trim().length > 0
            ? payloadItem.aggregated_output
            : null;
        const status = payloadItem.status === 'failed' ? 'failed' : 'completed';

        items.set(itemId, {
          id: itemId,
          kind: 'tool',
          label: 'Command',
          message: summary,
          timestamp: existing?.timestamp ?? event.createdAt,
          command: rawCommand ?? existing?.command,
          output,
          status,
        });
        continue;
      }
    }

    const formattedMessage = formatStructuredLogMessage(event.message);
    if (!formattedMessage) {
      continue;
    }

    const ignoredFragments = [
      'Workspace retained: cleanup mode is retain',
      'Codex session completed',
      'Codex agent session completed',
      'Run completed successfully',
      'Updating files:',
      'command execution completed.',
    ];

    if (ignoredFragments.some((fragment) => formattedMessage.includes(fragment))) {
      continue;
    }

    const isUsefulLog =
      formattedMessage.includes('Workspace created') ||
      formattedMessage.includes('Cloned repository') ||
      formattedMessage.includes('Prepared branch') ||
      formattedMessage.includes('Branch is up to date') ||
      formattedMessage.includes('Downloading repository files') ||
      formattedMessage.includes('Cancellation requested');

    if (!isUsefulLog) {
      continue;
    }

    standalone.push({
      id: event.id,
      kind: 'log',
      label: 'Work',
      message: formattedMessage,
      timestamp: event.createdAt,
    });
  }

  return [...standalone, ...Array.from(items.values())]
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
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
  const hasTrace = getDisplayActivityItems(items).length > 0;
  const hasModelReasoning = hasReasoningTrace(items);
  const hasSetupOnly = hasTrace && getDisplayActivityItems(items).every((item) => isSetupOnlyItem(item));

  if (seconds <= 0) {
    if (hasSetupOnly) return 'Setup complete';
    return hasTrace ? 'Worked briefly' : 'Responded directly';
  }

  if (hasSetupOnly) {
    return 'Setup complete';
  }

  if (hasModelReasoning) {
    return `Worked for ${seconds} seconds`;
  }

  if (hasTrace) {
    return `Worked for ${seconds} seconds`;
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

function isSetupOnlyItem(item: ActivityItem) {
  return [
    'Claimed by the worker.',
    'Prepared the local workspace.',
    'Workspace created.',
    'Cloned repository.',
    'Downloading repository files.',
    'Prepared branch main.',
    'Branch is up to date.',
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

function hasReasoningTrace(items: ActivityItem[]) {
  const displayItems = getDisplayActivityItems(items);
  return displayItems.some((item) => item.kind !== 'tool' && !isSetupOnlyItem(item));
}

function summarizeActivityItems(items: ActivityItem[]) {
  const displayItems = getDisplayActivityItems(items);
  const commandCount = displayItems.filter((item) => item.kind === 'tool').length;
  const setupCount = displayItems.filter((item) => item.kind === 'status' || isSetupOnlyItem(item)).length;
  const searchCount = displayItems.filter((item) => item.message === 'Searched the codebase').length;
  const listCount = displayItems.filter((item) => item.message === 'Listed files').length;

  const parts: string[] = [];

  if (searchCount > 0) {
    parts.push(`searched ${searchCount} time${searchCount === 1 ? '' : 's'}`);
  }

  if (listCount > 0) {
    parts.push(`listed files ${listCount} time${listCount === 1 ? '' : 's'}`);
  }

  if (commandCount > 0) {
    parts.push(`ran ${commandCount} command${commandCount === 1 ? '' : 's'}`);
  }

  if (setupCount > 0 && commandCount === 0) {
    parts.push(`completed ${setupCount} setup step${setupCount === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `${parts[0]!.charAt(0).toUpperCase()}${parts[0]!.slice(1)}${parts.length > 1 ? `, ${parts.slice(1).join(', ')}` : ''}.`;
}

function ActivityDetailRow({ item }: { item: ActivityItem }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(item.command || item.output);
  const Icon = item.kind === 'tool' ? Terminal : item.kind === 'status' ? GitBranch : FileText;
  const displayCommand = unwrapCommand(item.command);

  if (!hasDetails) {
    return (
      <div className="flex items-start gap-2 py-1.5">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-foreground/90">{item.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-background/40">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className="flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground/90">{item.message}</p>
          </div>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3">
          {displayCommand && (
            <div className="rounded-md border border-border/40 bg-card/60 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">Shell</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(displayCommand)}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/85">{displayCommand}</pre>
            </div>
          )}
          {item.output && (
            <div className={`rounded-md border border-border/40 bg-card/60 p-2 ${displayCommand ? 'mt-2' : ''}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">Output</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(item.output ?? '')}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/85">{item.output}</pre>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function InlineReasoningDetails({ items, label }: { items: ActivityItem[]; label?: string }) {
  const { isOpen, isStreaming } = useReasoning();
  const displayItems = getDisplayActivityItems(items);
  const setupOnly = displayItems.length > 0 && displayItems.every((item) => isSetupOnlyItem(item));
  const isSetupLabel = label?.startsWith('Setting up') ?? false;

  if (!isOpen) {
    return null;
  }

  if (displayItems.length === 0) {
    if (!isSetupLabel && !isStreaming) {
      return null;
    }

    return (
      <div className="mt-3 pl-6">
        <p className="text-xs text-muted-foreground/70">
          {isSetupLabel
            ? 'Setting up the workspace and repository.'
            : 'Working details will appear here as the agent emits command or tool activity.'}
        </p>
      </div>
    );
  }

  if (setupOnly && (isStreaming || isSetupLabel)) {
    return (
      <div className="mt-3 pl-6">
        <p className="text-xs text-muted-foreground/70">
          Setting up the workspace and repository.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 max-h-[52vh] overflow-y-auto pl-6 pr-2 space-y-2" style={{ scrollbarWidth: 'thin' }}>
      {setupOnly && !isStreaming && (
        <p className="text-xs text-muted-foreground/75">
          Environment, repository, and integrations ready.
        </p>
      )}
      {displayItems.map((item, index) => (
        <ActivityDetailRow
          key={`${item.id}-${index}`}
          item={item}
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
  const diffResizeStartXRef = useRef(0);
  const diffResizeStartWidthRef = useRef(0);
  const isNarrowDiffLayout = useIsNarrowDiffLayout();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [diffPanelWidth, setDiffPanelWidth] = useState(getStoredDiffPanelWidth);
  const [isResizingDiff, setIsResizingDiff] = useState(false);

  const { task, runs, isLoading, error } = useTaskDetail(taskId ?? '');
  const latestRun = runs[0];
  const [followUpConfig, setFollowUpConfig] = useState<FollowUpConfig | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>(() =>
    taskId ? readQueuedFollowUps(taskId) : [],
  );
  const [dispatchingQueuedId, setDispatchingQueuedId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(true);
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
      : 'Working...';
  const publicationMutation = useMutation({
    mutationFn: async () => {
      if (!latestRun?.id) {
        throw new Error('No completed run is available to publish yet.');
      }

      const response = await apiFetch(`/api/runs/${latestRun.id}/publish`, {
        method: 'POST',
      });

      if (response.status === 404) {
        throw new Error('Draft PR publishing is not available on this backend yet.');
      }

      if (!response.ok) {
        let message = 'Could not open a draft PR. Try again.';

        try {
          const body = (await response.json()) as {
            error?: {
              message?: string;
            };
          };
          if (typeof body?.error?.message === 'string' && body.error.message.trim().length > 0) {
            message = body.error.message;
          }
        } catch {
          // Ignore malformed error bodies and use the generic message.
        }

        throw new Error(message);
      }

      return response;
    },
    onSuccess: () => {
      broadcastTaskSync('run_publication_requested');
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-runs', taskId] });
      queryClient.invalidateQueries({ queryKey: ['run-events', latestRun?.id] });
      queryClient.invalidateQueries({ queryKey: ['run-diff', latestRun?.id] });
      toast.success('Draft PR request sent. This card will update when publication status arrives.');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  const eventsByRunId = new Map<string, RunEvent[]>();

  for (const [index, run] of runs
    .filter((candidate) => candidate.id !== latestRun?.id)
    .entries()) {
    eventsByRunId.set(run.id, historicalRunEventQueries[index]?.data ?? []);
  }

  if (latestRun) {
    eventsByRunId.set(latestRun.id, events);
  }

  const publicationState = task
    ? derivePublicationState(task, latestRun, events, publicationMutation.isPending)
    : null;
  const publicationProvider =
    latestRun?.publication?.provider ?? task?.publication?.provider ?? null;
  const headBranchForPublication =
    latestRun?.publication?.headBranch ??
    task?.publication?.headBranch ??
    latestRun?.branchName ??
    task?.branchName ??
    null;
  const baseBranchForPublication =
    latestRun?.publication?.baseBranch ??
    task?.publication?.baseBranch ??
    latestRun?.baseBranch ??
    task?.baseBranch ??
    null;
  const canRequestPublication = Boolean(
    task?.repoConnectionId &&
    latestRun?.id &&
    baseBranchForPublication &&
    (!publicationProvider || publicationProvider === 'github')
  );
  const publicationDiffQuery = useQuery({
    queryKey: ['run-diff', latestRun?.id, 'publication-card'],
    queryFn: () => apiGet<RunDiffPayload>(`/api/runs/${latestRun?.id}/diff`),
    enabled: Boolean(
      latestRun?.id &&
      (publicationState?.status !== 'idle' || canRequestPublication) &&
      (
        effectiveStatus === 'completed' ||
        publicationState?.status !== 'idle'
      ),
    ),
    refetchInterval:
      publicationState?.status === 'pending' || publicationState?.status === 'creating'
        ? 3000
        : false,
    staleTime: 5000,
  });

  useEffect(() => {
    setShouldAutoScroll(true);
  }, [latestRun?.id, taskId]);

  // Auto-scroll while the user is still pinned near the bottom.
  useEffect(() => {
    if (scrollRef.current && isStreaming && shouldAutoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isStreaming, shouldAutoScroll]);

  const handleConversationScroll = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    setShouldAutoScroll(distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX);
  }, []);

  const jumpToLatest = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollTop = element.scrollHeight;
    setShouldAutoScroll(true);
  }, []);

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
      broadcastTaskSync('task_cancelled');
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-runs', taskId] });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => apiPost<Run>(`/api/tasks/${taskId}/retry`, {}),
    onSuccess: () => {
      broadcastTaskSync('task_retried');
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
      broadcastTaskSync('run_created');
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

  const handleDiffResizeMove = React.useCallback((event: MouseEvent) => {
    const delta = diffResizeStartXRef.current - event.clientX;
    const nextWidth = Math.min(
      MAX_DIFF_PANEL_WIDTH,
      Math.max(MIN_DIFF_PANEL_WIDTH, diffResizeStartWidthRef.current + delta),
    );
    setDiffPanelWidth(nextWidth);
  }, []);

  const handleDiffResizeEnd = React.useCallback(() => {
    setIsResizingDiff(false);
    document.body.classList.remove('sidebar-resizing');
    try {
      localStorage.setItem(DIFF_PANEL_WIDTH_KEY, String(diffPanelWidth));
    } catch {
      // noop
    }
  }, [diffPanelWidth]);

  useEffect(() => {
    if (!isResizingDiff) return;

    document.addEventListener('mousemove', handleDiffResizeMove);
    document.addEventListener('mouseup', handleDiffResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleDiffResizeMove);
      document.removeEventListener('mouseup', handleDiffResizeEnd);
    };
  }, [handleDiffResizeEnd, handleDiffResizeMove, isResizingDiff]);

  const startDiffResize = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    diffResizeStartXRef.current = event.clientX;
    diffResizeStartWidthRef.current = diffPanelWidth;
    setIsResizingDiff(true);
    document.body.classList.add('sidebar-resizing');
  }, [diffPanelWidth]);

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
  const hasAssistantReply = blocks.some(
    (block) => block.type === 'agent' || (block.type === 'reasoning' && typeof block.content === 'string' && block.content.trim().length > 0),
  );
  const canShowDiff = Boolean(latestRun?.workspacePath);
  const showInlineDiff = diffOpen && canShowDiff && !isNarrowDiffLayout;
  const showSheetDiff = diffOpen && canShowDiff && isNarrowDiffLayout;
  const hasPublishableChanges = Boolean(
    publicationDiffQuery.data?.available && publicationDiffQuery.data?.hasChanges,
  );
  const showPublicationCard = Boolean(task.repoConnectionId && latestRun?.id) && (
    publicationState?.status !== 'idle' ||
    (effectiveStatus === 'completed' &&
      canRequestPublication &&
      hasPublishableChanges)
  );
  const publicationToneClasses =
    publicationState?.tone === 'success'
      ? 'border-status-success/25 bg-status-success/8'
      : publicationState?.tone === 'error'
        ? 'border-status-error/25 bg-status-error/8'
        : publicationState?.tone === 'info'
          ? 'border-status-info/25 bg-status-info/8'
          : 'border-border/70 bg-card/65';
  const publicationStatusLabel =
    publicationState?.status === 'creating'
      ? 'Opening'
      : publicationState?.status === 'pending'
        ? 'Queued'
        : publicationState?.status === 'success'
          ? 'Ready'
          : publicationState?.status === 'error'
            ? 'Needs retry'
            : 'Optional';

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col h-full">
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

        {canShowDiff ? (
          <Button
            variant={diffOpen ? 'secondary' : 'outline'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setDiffOpen((current) => !current)}
          >
            <FileCode2 className="w-3 h-3" />
            Diff
          </Button>
        ) : null}

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
        onScroll={handleConversationScroll}
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
                        <span>{block.label ?? getCompletedRunLabel(block.duration, block.activityItems ?? [])}</span>
                      )}
                    />
                    <ReasoningContent>
                      {block.content ? (
                        <div className="mb-4 pl-6">
                          <div className="streamdown-content text-sm text-foreground">
                            <Streamdown
                              plugins={{ code }}
                              mode="static"
                            >
                              {block.content}
                            </Streamdown>
                          </div>
                        </div>
                      ) : null}
                      <InlineReasoningDetails items={block.activityItems ?? []} label={block.label} />
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
                    <span>Setting up...</span>
                  )}
                />
                <ReasoningContent>
                  <InlineReasoningDetails items={[]} label="Setting up..." />
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
          {isStreaming && !shouldAutoScroll && (
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                onClick={jumpToLatest}
              >
                Jump To Latest
              </Button>
            </div>
          )}
          {queuedFollowUps.length > 0 && (
            <div className="mb-2 rounded-2xl border border-border/60 bg-background/80 px-3 py-2">
              <button
                type="button"
                onClick={() => setQueueOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-left"
              >
                <div className="flex items-center gap-2 text-sm text-foreground">
                  {queueOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                  )}
                  <span className="font-medium">{queuedFollowUps.length} Queued</span>
                </div>
              </button>

              {queueOpen && (
                <div className="mt-1 space-y-1">
                  {queuedFollowUps.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl px-2 py-2 ${index > 0 ? 'border-t border-border/50 pt-2' : ''}`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-500/20 text-[13px] font-medium text-lime-200">
                        L
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{item.prompt}</p>
                          {index === 0 && dispatchingQueuedId === item.id && (
                            <span className="text-[11px] text-muted-foreground">Sending next…</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                          {item.mode === 'steer'
                            ? 'Will interrupt and send next.'
                            : 'Will send when the current run finishes.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-full"
                          onClick={() => steerQueuedFollowUp(item.id)}
                          disabled={item.mode === 'steer'}
                          title="Steer"
                        >
                          <CornerUpRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-full"
                          onClick={() => setQueuedFollowUps((current) => current.filter((queued) => queued.id !== item.id))}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showPublicationCard && publicationState ? (
            <div className={`mb-3 rounded-2xl border px-4 py-3 ${publicationToneClasses}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/70 text-foreground/80">
                      {publicationState.status === 'success' ? (
                        <Check className="h-4 w-4" />
                      ) : publicationState.status === 'error' ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : publicationState.status === 'pending' || publicationState.status === 'creating' ? (
                        <Clock3 className="h-4 w-4" />
                      ) : (
                        <GitBranch className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {publicationState.status === 'success'
                            ? 'Draft PR ready'
                            : publicationState.status === 'error'
                              ? 'Draft PR needs another try'
                              : publicationState.status === 'pending' || publicationState.status === 'creating'
                                ? 'Opening draft PR'
                                : 'Task complete, want to open a draft PR?'}
                        </p>
                        <span className="rounded-full border border-border/60 bg-background/75 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          {publicationStatusLabel}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-muted-foreground">
                        {publicationState.description}
                      </p>

                      {publicationState.prTitle ? (
                        <p className="mt-2 text-xs text-foreground/80">
                          Suggested title: <span className="font-medium">{publicationState.prTitle}</span>
                        </p>
                      ) : null}

                      {publicationState.errorMessage ? (
                        <p className="mt-2 text-xs text-status-error">
                          {publicationState.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {publicationState.prUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => window.open(publicationState.prUrl ?? '', '_blank', 'noopener,noreferrer')}
                    >
                      <CornerUpRight className="h-3.5 w-3.5" />
                      View Draft PR
                    </Button>
                  ) : publicationState.status === 'success' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled
                    >
                      {publicationState.actionLabel}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={
                        publicationMutation.isPending ||
                        (
                          publicationState.status === 'idle' &&
                          !hasPublishableChanges
                        )
                      }
                      onClick={() => publicationMutation.mutate()}
                    >
                      {publicationMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {publicationState.actionLabel}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

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

      {showInlineDiff ? (
        <>
          <div
            className="hidden w-1 shrink-0 cursor-col-resize bg-border/50 transition-colors hover:bg-border lg:block"
            onMouseDown={startDiffResize}
          />
          <RunDiffSheet
            inlineWidth={diffPanelWidth}
            isLive={isActive}
            mode="inline"
            open={diffOpen}
            onOpenChange={setDiffOpen}
            runId={latestRun?.id}
          />
        </>
      ) : null}

      {showSheetDiff ? (
        <RunDiffSheet
          isLive={isActive}
          mode="sheet"
          open={diffOpen}
          onOpenChange={setDiffOpen}
          runId={latestRun?.id}
        />
      ) : null}
    </div>
  );
}
