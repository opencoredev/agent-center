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
import { ErrorBoundary } from './components/error-boundary';
import { LoginPage } from './routes/login';
import { ChatPage } from './routes/chat';
import { TaskDetailPage } from './routes/tasks/task-detail';
import { RunDetailPage } from './routes/runs/run-detail';
import { SettingsPage } from './routes/settings/index';
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

const layoutRoute = createRoute({
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
  getParentRoute: () => layoutRoute,
  path: '/',
  component: ChatPage,
});

const taskDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/tasks/$taskId',
  component: TaskDetailPage,
});

const runDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/runs/$runId',
  component: RunDetailPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([
    indexRoute,
    taskDetailRoute,
    runDetailRoute,
    settingsRoute,
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
