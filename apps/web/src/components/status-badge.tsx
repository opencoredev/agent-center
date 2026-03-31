import React from 'react';
import { cn } from '@/lib/utils';

type TaskStatus =
  | 'pending'
  | 'queued'
  | 'provisioning'
  | 'cloning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

const STATUS_STYLES: Record<string, { label: string; className: string; pulse?: boolean }> = {
  pending: {
    label: 'Pending',
    className: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  },
  queued: {
    label: 'Queued',
    className: 'text-yellow-400 bg-yellow-900/30 border-yellow-800/50',
  },
  provisioning: {
    label: 'Provisioning',
    className: 'text-blue-400 bg-blue-900/30 border-blue-800/50',
  },
  cloning: {
    label: 'Cloning',
    className: 'text-blue-400 bg-blue-900/30 border-blue-800/50',
  },
  running: {
    label: 'Running',
    className: 'text-blue-400 bg-blue-900/30 border-blue-800/50',
    pulse: true,
  },
  completed: {
    label: 'Completed',
    className: 'text-green-400 bg-green-900/30 border-green-800/50',
  },
  failed: {
    label: 'Failed',
    className: 'text-red-400 bg-red-900/30 border-red-800/50',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  },
  paused: {
    label: 'Paused',
    className: 'text-orange-400 bg-orange-900/30 border-orange-800/50',
  },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_STYLES[status] ?? {
    label: status,
    className: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-400" />
        </span>
      )}
      {config.label}
    </span>
  );
}
