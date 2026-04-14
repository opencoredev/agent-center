import React from 'react';
import { useNavigate, useMatchRoute } from '@tanstack/react-router';
import {
  PanelLeftClose,
  SquarePen,
  Home,
  Zap,
  Settings,
  HelpCircle,
  Circle,
  MoreHorizontal,
  Pin,
  Archive,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskList } from '@/hooks/use-zero-queries';
import { apiPatch, apiPost } from '@/lib/api-client';
import { broadcastTaskSync } from '@/lib/task-sync';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: string | number;
  metadata?: Record<string, unknown>;
}

const ACTIVE_STATUSES = new Set(['queued', 'provisioning', 'cloning', 'running', 'in_progress', 'paused']);

function timeAgo(date: string | number): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function StatusDot({ status }: { status: string }) {
  let color = 'text-muted-foreground/50';
  if (status === 'completed') color = 'text-status-success';
  else if (['pending', 'queued', 'provisioning', 'cloning', 'running', 'in_progress'].includes(status)) color = 'text-status-warning';
  else if (status === 'failed' || status === 'error') color = 'text-status-error';

  const isActive = ['pending', 'queued', 'provisioning', 'cloning', 'running', 'in_progress'].includes(status);

  return <Circle className={`w-2 h-2 fill-current ${color} ${isActive ? 'animate-pulse' : ''}`} />;
}

function TaskSkeletonRow() {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <Skeleton className="w-3 h-3 rounded-full flex-shrink-0" />
      <Skeleton className="w-[60%] h-3 rounded" />
      <div className="flex-1" />
      <Skeleton className="w-6 h-3 rounded flex-shrink-0" />
    </div>
  );
}

export function ChatSidebar({ onCollapse }: { onCollapse: () => void }) {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const queryClient = useQueryClient();
  const [menuTaskId, setMenuTaskId] = React.useState<string | null>(null);
  const [archiveDialogTask, setArchiveDialogTask] = React.useState<Task | null>(null);
  const [renameTaskId, setRenameTaskId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');

  const isHome = matchRoute({ to: '/' });

  const { tasks, isLoading } = useTaskList();

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, body }: { taskId: string; body: Record<string, unknown> }) =>
      apiPatch(`/api/tasks/${taskId}`, body),
    onSuccess: async () => {
      broadcastTaskSync('task_updated');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const cancelTaskMutation = useMutation({
    mutationFn: async (taskId: string) => apiPost(`/api/tasks/${taskId}/cancel`, {}),
    onSuccess: async () => {
      broadcastTaskSync('task_cancelled');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const archivedTasks = tasks.filter((task) => typeof task.metadata?.archivedAt === 'string');
  const pinnedTasks = tasks.filter((task) => typeof task.metadata?.pinnedAt === 'string' && typeof task.metadata?.archivedAt !== 'string');
  const activeTasks = tasks.filter((task) => ACTIVE_STATUSES.has(task.status) && typeof task.metadata?.archivedAt !== 'string').slice(0, 6);
  const recentTasks = tasks.filter((task) => !ACTIVE_STATUSES.has(task.status) && typeof task.metadata?.archivedAt !== 'string' && typeof task.metadata?.pinnedAt !== 'string').slice(0, 12);

  const handlePinToggle = async (task: Task) => {
    const isPinned = typeof task.metadata?.pinnedAt === 'string';
    await updateTaskMutation.mutateAsync({
      taskId: task.id,
      body: {
        metadata: {
          ...task.metadata,
          pinnedAt: isPinned ? null : new Date().toISOString(),
        },
      },
    });
    setMenuTaskId(null);
  };

  const handleArchive = async (task: Task) => {
    if (ACTIVE_STATUSES.has(task.status)) {
      await cancelTaskMutation.mutateAsync(task.id);
    }

    await updateTaskMutation.mutateAsync({
      taskId: task.id,
      body: {
        metadata: {
          ...task.metadata,
          archivedAt: new Date().toISOString(),
          pinnedAt: null,
        },
      },
    });
    setArchiveDialogTask(null);
    toast.success(`Archived "${task.title}".`);
  };

  const handleRenameSubmit = async (task: Task) => {
    const nextTitle = renameValue.trim();
    if (!nextTitle || nextTitle === task.title) {
      setRenameTaskId(null);
      return;
    }

    await updateTaskMutation.mutateAsync({
      taskId: task.id,
      body: { title: nextTitle },
    });
    setRenameTaskId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 pb-2">
        <div className="flex items-center justify-between px-1 pb-3">
          <div className="w-8" />
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            Agent Center
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCollapse}
            className="h-8 w-8 text-muted-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <button
          onClick={() => navigate({ to: '/' })}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/18 bg-gradient-to-b from-primary/[0.08] to-primary/[0.03] px-3 py-3 text-sm font-semibold text-sidebar-foreground shadow-sm transition-colors hover:border-primary/28 hover:from-primary/[0.12] hover:to-primary/[0.05] cursor-pointer"
        >
          <SquarePen className="h-4 w-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="px-2 space-y-0.5">
        <button
          onClick={() => navigate({ to: '/' })}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
            isHome
              ? 'bg-muted text-foreground font-medium'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
          }`}
        >
          <Home className="w-4 h-4" />
          Home
        </button>
        <button
          onClick={() => navigate({ to: '/automations' })}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer"
        >
          <Zap className="w-4 h-4" />
          Automations
        </button>
      </nav>

      <Separator className="my-3 mx-2 w-auto" />

      {/* Recent Tasks */}
      <div className="flex-1 overflow-y-auto px-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(0.4 0 0 / 0.25) transparent' }}>
        {pinnedTasks.length > 0 && (
          <div className="mb-4">
            <p className="px-2.5 pb-2 text-xs font-medium text-muted-foreground">
              Pinned
            </p>
            <div className="space-y-0.5">
              {pinnedTasks.map((task) => {
                const isActive = matchRoute({
                  to: '/tasks/$taskId',
                  params: { taskId: task.id },
                });

                return (
                  <div
                    key={task.id}
                    className={`relative w-full rounded-md group ${
                      isActive ? 'bg-muted' : 'hover:bg-sidebar-accent/50'
                    }`}
                  >
                    <button
                      onDoubleClick={() => {
                        setRenameTaskId(task.id);
                        setRenameValue(task.title);
                      }}
                      onClick={() =>
                        navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
                      }
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors cursor-pointer"
                    >
                      <Pin className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                      {renameTaskId === task.id ? (
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onBlur={() => void handleRenameSubmit(task)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              void handleRenameSubmit(task);
                            }
                            if (event.key === 'Escape') {
                              setRenameTaskId(null);
                            }
                          }}
                          className="h-7 text-sm"
                        />
                      ) : (
                        <span className={`text-sm truncate flex-1 ${isActive ? 'text-foreground font-medium' : 'text-sidebar-foreground'}`}>
                          {task.title}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/50 flex-shrink-0 tabular-nums">
                        {timeAgo(task.createdAt)}
                      </span>
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuTaskId(menuTaskId === task.id ? null : task.id);
                        }}
                        className="h-7 w-7 rounded-md bg-background/90 border border-border/60 flex items-center justify-center"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    {menuTaskId === task.id && (
                      <div className="absolute right-2 top-9 z-20 w-36 rounded-lg border border-border bg-popover shadow-lg p-1">
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => {
                          setRenameTaskId(task.id);
                          setRenameValue(task.title);
                          setMenuTaskId(null);
                        }}>
                          <Pencil className="w-3.5 h-3.5" />
                          Rename
                        </button>
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => void handlePinToggle(task)}>
                          <Pin className="w-3.5 h-3.5" />
                          Unpin
                        </button>
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => setArchiveDialogTask(task)}>
                          <Archive className="w-3.5 h-3.5" />
                          Archive
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activeTasks.length > 0 && (
          <div className="mb-4">
            <p className="px-2.5 pb-2 text-xs font-medium text-muted-foreground">
              Active
            </p>
            <div className="space-y-0.5">
              {activeTasks.map((task) => {
                const isActive = matchRoute({
                  to: '/tasks/$taskId',
                  params: { taskId: task.id },
                });

                return (
                  <div
                    key={task.id}
                    className={`relative w-full rounded-md group ${
                      isActive ? 'bg-muted' : 'hover:bg-sidebar-accent/50'
                    }`}
                  >
                    <button
                      onDoubleClick={() => {
                        setRenameTaskId(task.id);
                        setRenameValue(task.title);
                      }}
                      onClick={() =>
                        navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
                      }
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors cursor-pointer"
                    >
                      <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                        <StatusDot status={task.status} />
                      </div>
                      {renameTaskId === task.id ? (
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onBlur={() => void handleRenameSubmit(task)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              void handleRenameSubmit(task);
                            }
                            if (event.key === 'Escape') {
                              setRenameTaskId(null);
                            }
                          }}
                          className="h-7 text-sm"
                        />
                      ) : (
                        <span className={`text-sm truncate flex-1 ${isActive ? 'text-foreground font-medium' : 'text-sidebar-foreground'}`}>
                          {task.title}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/50 flex-shrink-0 tabular-nums">
                        {timeAgo(task.createdAt)}
                      </span>
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuTaskId(menuTaskId === task.id ? null : task.id);
                        }}
                        className="h-7 w-7 rounded-md bg-background/90 border border-border/60 flex items-center justify-center"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    {menuTaskId === task.id && (
                      <div className="absolute right-2 top-9 z-20 w-36 rounded-lg border border-border bg-popover shadow-lg p-1">
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => {
                          setRenameTaskId(task.id);
                          setRenameValue(task.title);
                          setMenuTaskId(null);
                        }}>
                          <Pencil className="w-3.5 h-3.5" />
                          Rename
                        </button>
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => void handlePinToggle(task)}>
                          <Pin className="w-3.5 h-3.5" />
                          Pin
                        </button>
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => setArchiveDialogTask(task)}>
                          <Archive className="w-3.5 h-3.5" />
                          Archive
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="px-2.5 pb-2 text-xs font-medium text-muted-foreground">
          Recent
        </p>
        {isLoading ? (
          <div className="space-y-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <TaskSkeletonRow key={i} />
            ))}
          </div>
        ) : recentTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 px-2.5 py-6 text-center">
            No completed tasks yet
          </p>
        ) : (
          <div className="space-y-0.5">
            {recentTasks.map((task) => {
              const isActive = matchRoute({
                to: '/tasks/$taskId',
                params: { taskId: task.id },
              });

              return (
                <div
                  key={task.id}
                  className={`relative w-full rounded-md group ${
                    isActive ? 'bg-muted' : 'hover:bg-sidebar-accent/50'
                  }`}
                >
                  <button
                    onDoubleClick={() => {
                      setRenameTaskId(task.id);
                      setRenameValue(task.title);
                    }}
                    onClick={() =>
                      navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
                    }
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors cursor-pointer"
                  >
                    <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                      <StatusDot status={task.status} />
                    </div>
                    {renameTaskId === task.id ? (
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={() => void handleRenameSubmit(task)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void handleRenameSubmit(task);
                          }
                          if (event.key === 'Escape') {
                            setRenameTaskId(null);
                          }
                        }}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span className={`text-sm truncate flex-1 ${isActive ? 'text-foreground font-medium' : 'text-sidebar-foreground'}`}>
                        {task.title}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground/50 flex-shrink-0 tabular-nums">
                      {timeAgo(task.createdAt)}
                    </span>
                  </button>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuTaskId(menuTaskId === task.id ? null : task.id);
                      }}
                      className="h-7 w-7 rounded-md bg-background/90 border border-border/60 flex items-center justify-center"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  {menuTaskId === task.id && (
                    <div className="absolute right-2 top-9 z-20 w-36 rounded-lg border border-border bg-popover shadow-lg p-1">
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => {
                        setRenameTaskId(task.id);
                        setRenameValue(task.title);
                        setMenuTaskId(null);
                      }}>
                        <Pencil className="w-3.5 h-3.5" />
                        Rename
                      </button>
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => void handlePinToggle(task)}>
                        <Pin className="w-3.5 h-3.5" />
                        Pin
                      </button>
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent" onClick={() => setArchiveDialogTask(task)}>
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-sidebar-border p-2 space-y-0.5">
        <button
          onClick={() => navigate({ to: '/archived' })}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer"
        >
          <Archive className="w-4 h-4" />
          Archived
          {archivedTasks.length > 0 && (
            <span className="ml-auto text-[11px] text-muted-foreground/70">{archivedTasks.length}</span>
          )}
        </button>
        <button
          onClick={() => navigate({ to: '/settings/models' })}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground/50 cursor-default"
        >
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
      </div>

      <Dialog open={archiveDialogTask !== null} onOpenChange={(open) => !open && setArchiveDialogTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive task?</DialogTitle>
            <DialogDescription>
              {archiveDialogTask && ACTIVE_STATUSES.has(archiveDialogTask.status)
                ? 'This task is still active. Archiving it will cancel the run first and then move it into Archived.'
                : 'This task will move out of the main sidebar into Archived. Archived tasks are automatically deleted after 30 days.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveDialogTask(null)}>Keep task</Button>
            <Button
              onClick={() => archiveDialogTask && void handleArchive(archiveDialogTask)}
              disabled={updateTaskMutation.isPending || cancelTaskMutation.isPending}
            >
              {ACTIVE_STATUSES.has(archiveDialogTask?.status ?? '') ? 'Cancel and archive' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
