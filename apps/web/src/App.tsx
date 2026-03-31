import React from 'react';
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/error-boundary';
import { LoginPage } from './routes/login';
import { DashboardPage } from './routes/dashboard';
import { TasksPage } from './routes/tasks/index';
import { TaskDetailPage } from './routes/tasks/task-detail';
import { RunDetailPage } from './routes/runs/run-detail';
import { ProjectsPage } from './routes/projects/index';
import { AutomationsPage } from './routes/automations/index';
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
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: DashboardPage,
});

const tasksRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/tasks',
  component: TasksPage,
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

const projectsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/projects',
  component: ProjectsPage,
});

const automationsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/automations',
  component: AutomationsPage,
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
    tasksRoute,
    taskDetailRoute,
    runDetailRoute,
    projectsRoute,
    automationsRoute,
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
