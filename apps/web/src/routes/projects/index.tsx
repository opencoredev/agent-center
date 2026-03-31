import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, GitBranch, Calendar } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';

interface Project {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  createdAt: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface CreateProjectInput {
  name: string;
  slug: string;
  workspaceId: string;
  defaultBranch: string;
  description?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [description, setDescription] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
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

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  const mutation = useMutation({
    mutationFn: (data: CreateProjectInput) => apiPost<Project>('/api/projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  function resetForm() {
    setName('');
    setSlug('');
    setWorkspaceId('');
    setDefaultBranch('main');
    setDescription('');
    setSlugTouched(false);
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
    mutation.mutate({
      name,
      slug,
      workspaceId,
      defaultBranch,
      description: description || undefined,
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
          <h2 className="text-lg font-semibold text-zinc-50">Create Project</h2>
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
              placeholder="My Project"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Slug</label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="my-project"
              required
            />
            <p className="text-xs text-zinc-500">Auto-derived from name. Used in URLs.</p>
          </div>

          <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Default Branch</label>
            <Input
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              placeholder="main"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">
              Description <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-none"
            />
          </div>

          {formError && (
            <p className="text-sm text-red-400">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-2 rounded-md bg-zinc-800 text-zinc-400">
          <FolderOpen className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-zinc-50 truncate">{project.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{project.slug}</p>
        </div>
      </div>

      {project.description && (
        <p className="text-sm text-zinc-400 line-clamp-2">{project.description}</p>
      )}

      <div className="flex items-center gap-4 mt-auto pt-1 border-t border-zinc-800 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <GitBranch className="w-3 h-3" />
          {project.defaultBranch}
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: projects = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet<Project[]>('/api/projects'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-50">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>Create Project</Button>
      </div>

      {isLoading && (
        <p className="text-zinc-400 text-sm">Loading projects...</p>
      )}
      {error && (
        <EmptyState
          title="Failed to load projects"
          description={(error as Error).message || 'Could not connect to API'}
        />
      )}

      {!isLoading && !error && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
          <FolderOpen className="w-10 h-10 text-zinc-700" />
          <p className="text-sm">No projects yet.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            Create your first project
          </Button>
        </div>
      )}

      {projects.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
