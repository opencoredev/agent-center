const TASK_SYNC_CHANNEL = 'agent_center_task_sync';
const TASK_SYNC_STORAGE_KEY = 'agent_center_task_sync_ping';

interface TaskSyncMessage {
  at: number;
  reason: string;
}

function createTaskSyncMessage(reason: string): TaskSyncMessage {
  return {
    at: Date.now(),
    reason,
  };
}

export function broadcastTaskSync(reason = 'tasks_changed') {
  const message = createTaskSyncMessage(reason);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const channel = new BroadcastChannel(TASK_SYNC_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unavailable; storage event fallback below still helps.
  }

  try {
    localStorage.setItem(TASK_SYNC_STORAGE_KEY, JSON.stringify(message));
  } catch {
    // noop
  }
}

export function createTaskSyncSubscription(onChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  let channel: BroadcastChannel | null = null;

  try {
    channel = new BroadcastChannel(TASK_SYNC_CHANNEL);
    channel.onmessage = () => onChange();
  } catch {
    channel = null;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === TASK_SYNC_STORAGE_KEY && event.newValue) {
      onChange();
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.close();
    window.removeEventListener('storage', handleStorage);
  };
}

