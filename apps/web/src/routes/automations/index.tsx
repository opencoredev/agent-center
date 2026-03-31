import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';

interface Automation {
  id: string;
  workspaceId: string;
  name: string;
  enabled: boolean;
  cronExpression: string;
  taskTemplateTitle: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

function ToggleSwitch({
  enabled,
  onToggle,
  loading,
}: {
  enabled: boolean;
  onToggle: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-green-600' : 'bg-zinc-600'
      } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

interface CreateAutomationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateAutomationDialog({ open, onOpenChange }: CreateAutomationDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [cronExpression, setCronExpression] = useState('0 * * * *');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [permissionMode, setPermissionMode] = useState<'safe' | 'yolo' | 'custom'>('safe');
  const [formError, setFormError] = useState('');

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiGet<Workspace[]>('/api/workspaces'),
    enabled: open,
  });

  useEffect(() => {
    if (workspaces.length > 0 && !workspaceId) {
      setWorkspaceId(workspaces[0]?.id || '');
    }
  }, [workspaces, workspaceId]);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<Automation>('/api/automations', {
        name,
        cronExpression,
        taskTemplateTitle: taskTitle,
        taskTemplatePrompt: taskPrompt,
        workspaceId,
        permissionMode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  function resetForm() {
    setName('');
    setCronExpression('0 * * * *');
    setTaskTitle('');
    setTaskPrompt('');
    setWorkspaceId('');
    setPermissionMode('safe');
    setFormError('');
  }

  function handleClose() {
    onOpenChange(false);
    resetForm();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!workspaceId) {
      setFormError('Please select a workspace');
      return;
    }
    mutation.mutate();
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50">Create Automation</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-zinc-400 hover:text-zinc-50 transition-colors text-lg leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily report"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">
              Cron Expression
            </label>
            <Input
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 * * * *"
              required
            />
            <p className="text-xs text-zinc-500">
              e.g. <code className="text-zinc-400">0 * * * *</code> = every hour at minute 0
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Task Title</label>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Generate daily report"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Task Prompt</label>
            <textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder="Describe what the agent should do on each run..."
              rows={4}
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-none"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-sm font-medium text-zinc-300">Workspace</label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                required
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="">Select a workspace</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-sm font-medium text-zinc-300">
                Permission Mode
              </label>
              <select
                value={permissionMode}
                onChange={(e) =>
                  setPermissionMode(e.target.value as 'safe' | 'yolo' | 'custom')
                }
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="safe">Safe</option>
                <option value="yolo">Yolo</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-400">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create Automation'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function AutomationsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: automations = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['automations'],
    queryFn: () => apiGet<Automation[]>('/api/automations'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPost(`/api/automations/${id}/${enabled ? 'disable' : 'enable'}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-50">Automations</h1>
        <Button onClick={() => setCreateOpen(true)}>Create Automation</Button>
      </div>

      {isLoading && (
        <p className="text-zinc-400 text-sm">Loading automations...</p>
      )}
      {error && (
        <EmptyState
          title="Failed to load automations"
          description={(error as Error).message || 'Could not connect to API'}
        />
      )}

      {!isLoading && !error && automations.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
          <p className="text-sm">No automations found.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            Create your first automation
          </Button>
        </div>
      )}

      {automations.length > 0 && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900/50 border-b border-zinc-800">
                <th className="text-left px-4 py-3 font-medium text-zinc-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">Cron</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">Enabled</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">Last Run</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">Next Run</th>
              </tr>
            </thead>
            <tbody>
              {automations.map((automation) => (
                <tr
                  key={automation.id}
                  className="border-b border-zinc-800 last:border-0 transition-colors hover:bg-zinc-900/40"
                >
                  <td className="px-4 py-3 font-medium text-zinc-50">
                    {automation.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-300">
                      {automation.cronExpression}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <ToggleSwitch
                      enabled={automation.enabled}
                      loading={
                        toggleMutation.isPending &&
                        toggleMutation.variables?.id === automation.id
                      }
                      onToggle={() =>
                        toggleMutation.mutate({
                          id: automation.id,
                          enabled: automation.enabled,
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {automation.lastRunAt
                      ? new Date(automation.lastRunAt).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {automation.nextRunAt
                      ? new Date(automation.nextRunAt).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateAutomationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
