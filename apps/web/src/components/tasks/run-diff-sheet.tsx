import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parsePatchFiles } from '@pierre/diffs';
import { PatchDiff } from '@pierre/diffs/react';
import { FileCode2, GitCommitHorizontal, Loader2, RefreshCw, X } from 'lucide-react';

import { apiGet } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface RunDiffPayload {
  available: boolean;
  error: string | null;
  hasChanges: boolean;
  patch: string | null;
  stats: string | null;
  statusLines: string[];
  workspacePath: string | null;
}

interface RunDiffSheetProps {
  isLive?: boolean;
  inlineWidth?: number;
  mode?: 'inline' | 'sheet';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string | null | undefined;
}

type RenderablePatch =
  | {
      kind: 'parsed';
      changedPaths: string[];
    }
  | {
      kind: 'raw';
      reason: string;
      text: string;
    }
  | null;

const DIFF_PANEL_UNSAFE_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 94%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 94%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 94%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 90%, var(--status-success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 84%, var(--status-success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 82%, var(--status-success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 76%, var(--status-success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 90%, var(--status-error));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 84%, var(--status-error));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 82%, var(--status-error));
  --diffs-bg-deletion-emphasis-override: color-mix(in srgb, var(--background) 76%, var(--status-error));

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-bottom: 1px solid var(--border) !important;
}
`;

function parseRenderablePatch(patch: string | null | undefined, cacheScope: string): RenderablePatch {
  if (!patch || patch.trim().length === 0) {
    return null;
  }

  try {
    const parsed = parsePatchFiles(patch, cacheScope);
    const changedPaths = parsed
      .flatMap((entry) => entry.files)
      .map((file) => file.name ?? file.prevName ?? '')
      .map((path) => path.replace(/^[ab]\//u, '').trim())
      .filter(Boolean);

    if (changedPaths.length > 0) {
      return {
        kind: 'parsed',
        changedPaths: Array.from(new Set(changedPaths)),
      };
    }

    return {
      kind: 'raw',
      reason: 'Unsupported diff format. Showing raw patch.',
      text: patch,
    };
  } catch {
    return {
      kind: 'raw',
      reason: 'Failed to parse patch. Showing raw patch.',
      text: patch,
    };
  }
}

function extractStatusPath(line: string) {
  return line.replace(/^[ MADRCU?!]{1,2}\s+/u, '').trim();
}

function resolveThemeType(): 'light' | 'dark' {
  if (typeof document === 'undefined') {
    return 'dark';
  }

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function formatWorkspaceLabel(workspacePath: string | null) {
  if (!workspacePath) {
    return 'Open the latest run diff for this task.';
  }

  const parts = workspacePath.split('/');
  return parts.length > 4 ? `Workspace: .../${parts.slice(-4).join('/')}` : `Workspace: ${workspacePath}`;
}

function RunDiffPanelContent({
  diff,
  diffQuery,
  fileChips,
  isLive,
  onClose,
  renderablePatch,
  themeType,
  title,
}: {
  diff: RunDiffPayload | undefined;
  diffQuery: ReturnType<typeof useQuery<RunDiffPayload>>;
  fileChips: string[];
  isLive: boolean;
  onClose?: (() => void) | null;
  renderablePatch: RenderablePatch;
  themeType: 'light' | 'dark';
  title: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--card)_80%,transparent)_0%,transparent_50%)]">
      <div className="border-b border-border/70 px-5 py-4 pr-14">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-card/70 shadow-xs">
            <FileCode2 className="h-4 w-4 text-foreground/85" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {title}
              {isLive ? (
                <span className="rounded-full border border-status-info/30 bg-status-info/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-status-info">
                  Live
                </span>
              ) : null}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground/75">
              {formatWorkspaceLabel(diff?.workspacePath ?? null)}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="mt-0.5 h-8 w-8 shrink-0 rounded-full text-muted-foreground"
              onClick={() => void diffQuery.refetch()}
              title="Refresh diff"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', diffQuery.isFetching && 'animate-spin')} />
            </Button>
            {onClose ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                onClick={onClose}
                title="Close diff"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        {diff && diff.available && diff.hasChanges ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/70 bg-card/80 px-2.5 py-1 text-[11px] text-foreground/85">
                {fileChips.length} {fileChips.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            {fileChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {fileChips.map((file) => (
                  <span
                    key={file}
                    className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground"
                  >
                    {file}
                  </span>
                ))}
              </div>
            ) : null}

            {diff.stats ? (
              <div className="rounded-2xl border border-border/60 bg-card/35 px-3 py-2">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/65">
                  <GitCommitHorizontal className="h-3 w-3" />
                  Summary
                </div>
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-muted-foreground/85">
                  {diff.stats}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {diffQuery.isLoading ? (
          <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading diff...
          </div>
        ) : diffQuery.error instanceof Error ? (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-sm text-destructive">
            {diffQuery.error.message}
          </div>
        ) : !diff ? (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No diff loaded yet.
          </div>
        ) : !diff.available ? (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {diff.error ?? 'Diff is not available for this run yet.'}
          </div>
        ) : !diff.hasChanges ? (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No workspace changes detected for this run.
          </div>
        ) : renderablePatch?.kind === 'raw' ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground/75">{renderablePatch.reason}</p>
            <pre
              className={cn(
                'overflow-auto rounded-2xl border border-border/70 bg-card/30 p-4 font-mono text-[11px] leading-5 text-foreground/85',
                'whitespace-pre-wrap',
              )}
            >
              {renderablePatch.text}
            </pre>
          </div>
        ) : diff.patch ? (
          <div className="overflow-hidden rounded-[1.25rem] border border-border/70 bg-card/25 shadow-sm">
            <PatchDiff
              disableWorkerPool
              patch={diff.patch}
              options={{
                diffStyle: 'unified',
                lineDiffType: 'none',
                overflow: 'scroll',
                themeType,
                unsafeCSS: DIFF_PANEL_UNSAFE_CSS,
              }}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Patch output is empty for this run.
          </div>
        )}
      </div>
    </div>
  );
}

export function RunDiffSheet({
  isLive = false,
  inlineWidth,
  mode = 'sheet',
  onOpenChange,
  open,
  runId,
}: RunDiffSheetProps) {
  const diffQuery = useQuery({
    queryKey: ['run-diff', runId],
    queryFn: () => apiGet<RunDiffPayload>(`/api/runs/${runId}/diff`),
    enabled: open && !!runId,
    refetchInterval: open && isLive ? 3000 : false,
    staleTime: 5000,
  });

  const diff = diffQuery.data;
  const renderablePatch = useMemo(
    () => parseRenderablePatch(diff?.patch, `run-diff:${runId ?? 'unknown'}`),
    [diff?.patch, runId],
  );
  const themeType = resolveThemeType();
  const changedFiles = diff?.statusLines.map(extractStatusPath).filter(Boolean) ?? [];
  const fileChips =
    changedFiles.length > 0
      ? changedFiles
      : renderablePatch?.kind === 'parsed'
        ? renderablePatch.changedPaths
        : [];

  const panelBody = (
    <RunDiffPanelContent
      diff={diff}
      diffQuery={diffQuery}
      fileChips={fileChips}
      isLive={isLive}
      onClose={mode === 'inline' ? () => onOpenChange(false) : null}
      renderablePatch={renderablePatch}
      themeType={themeType}
      title={<div className="text-base font-semibold tracking-tight text-foreground">Diff</div>}
    />
  );

  if (mode === 'inline') {
    if (!open) return null;

    return (
      <aside
        className="hidden h-full min-w-[360px] max-w-[820px] shrink-0 border-l border-border/80 bg-background/96 shadow-2xl lg:flex"
        style={inlineWidth ? { width: `${inlineWidth}px` } : undefined}
      >
        {panelBody}
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(92vw,980px)] max-w-none border-l border-border/80 bg-background/96 p-0 shadow-2xl backdrop-blur-xl"
      >
        {panelBody}
      </SheetContent>
    </Sheet>
  );
}
