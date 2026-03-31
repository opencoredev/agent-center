import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
}

interface CreateTaskInput {
  workspaceId: string;
  title: string;
  prompt: string;
  permissionMode: string;
  config: { agentProvider: string };
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agentProvider, setAgentProvider] = useState<'none' | 'claude' | 'codex'>('none');
  const [permissionMode, setPermissionMode] = useState<'safe' | 'yolo' | 'custom'>('safe');
  const [workspaceId, setWorkspaceId] = useState('');
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
    mutationFn: (data: CreateTaskInput) => apiPost<Task>('/api/tasks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  function resetForm() {
    setTitle('');
    setPrompt('');
    setAgentProvider('none');
    setPermissionMode('safe');
    setFormError('');
    setWorkspaceId('');
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
    mutation.mutate({
      workspaceId,
      title,
      prompt,
      permissionMode,
      config: { agentProvider },
    });
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
          <h2 className="text-lg font-semibold text-zinc-50">Create Task</h2>
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
            <label className="text-sm font-medium text-zinc-300">
              Workspace
            </label>
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what the agent should do..."
              rows={4}
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-none"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-sm font-medium text-zinc-300">
                Agent Provider
              </label>
              <select
                value={agentProvider}
                onChange={(e) =>
                  setAgentProvider(e.target.value as 'none' | 'claude' | 'codex')
                }
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="none">None</option>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
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
              {mutation.isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
