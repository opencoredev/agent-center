import React from 'react';
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { ChatLayout } from './components/chat/chat-layout';
import { SettingsLayout } from './components/settings/settings-layout';
import { ErrorBoundary } from './components/error-boundary';
import { LoginPage } from './routes/login';
import { ChatPage } from './routes/chat';
import { AutomationsPage } from './routes/automations';
import { ArchivedTasksPage } from './routes/archived';
import { TaskDetailPage } from './routes/tasks/task-detail';
import { RunDetailPage } from './routes/runs/run-detail';
import { ModelsPage } from './routes/settings/models';
import { RepositoriesPage } from './routes/settings/repositories';
import { ApiKeysPage } from './routes/settings/api-keys';
import { WorkspacePage } from './routes/settings/workspace';
import { ProfilePage } from './routes/settings/profile';
import { getToken, isAuthEnabled } from './lib/auth';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    if (!isAuthEnabled() || getToken()) {
      throw redirect({ to: '/' });
    }
  },
  component: LoginPage,
});

// ── Chat layout (main app) ─────────────────────────────────────────────────

const chatLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  beforeLoad: () => {
    if (isAuthEnabled() && !getToken()) {
      throw redirect({ to: '/login' });
    }
  },
  component: ChatLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: '/',
  component: ChatPage,
});

const automationsRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: '/automations',
  component: AutomationsPage,
});

const archivedRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: '/archived',
  component: ArchivedTasksPage,
});

const taskDetailRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: '/tasks/$taskId',
  component: TaskDetailPage,
});

const runDetailRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: '/runs/$runId',
  component: RunDetailPage,
});

// ── Settings layout (full-page, separate from chat) ─────────────────────────

const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_settings',
  beforeLoad: () => {
    if (isAuthEnabled() && !getToken()) {
      throw redirect({ to: '/login' });
    }
  },
  component: SettingsLayout,
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings',
  beforeLoad: () => {
    throw redirect({ to: '/settings/models' });
  },
});

const settingsModelsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/models',
  component: ModelsPage,
});

const settingsRepositoriesRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/repositories',
  component: RepositoriesPage,
});

const settingsApiKeysRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/api-keys',
  component: ApiKeysPage,
});

const settingsWorkspaceRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/workspace',
  component: WorkspacePage,
});

const settingsProfileRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/profile',
  component: ProfilePage,
});

// ── Route tree ──────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  loginRoute,
  chatLayoutRoute.addChildren([
    indexRoute,
    automationsRoute,
    archivedRoute,
    taskDetailRoute,
    runDetailRoute,
  ]),
  settingsLayoutRoute.addChildren([
    settingsIndexRoute,
    settingsModelsRoute,
    settingsRepositoriesRoute,
    settingsApiKeysRoute,
    settingsWorkspaceRoute,
    settingsProfileRoute,
  ]),
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
