import React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  CheckSquare,
  FolderOpen,
  Clock,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { isAuthEnabled } from '@/lib/auth';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, exact: false },
  { to: '/projects', label: 'Projects', icon: FolderOpen, exact: false },
  { to: '/automations', label: 'Automations', icon: Clock, exact: false },
  { to: '/settings', label: 'Settings', icon: Settings, exact: false },
] as const;

type NavTo = (typeof navItems)[number]['to'];

function NavLink({
  to,
  label,
  icon: Icon,
  exact,
}: {
  to: NavTo;
  label: string;
  icon: React.ElementType;
  exact: boolean;
}) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const isActive = exact ? currentPath === to : currentPath.startsWith(to);

  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-zinc-800 text-zinc-50'
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const { logout } = useAuth();
  const authEnabled = isAuthEnabled();

  return (
    <aside className="w-64 h-screen bg-zinc-950 border-r border-zinc-800 flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-zinc-100 tracking-tight">
            ⬡ Agent Center
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.to} {...item} />
        ))}
      </nav>

      {authEnabled && (
        <div className="px-3 py-4 border-t border-zinc-800">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      )}

      {!authEnabled && (
        <div className="px-4 py-4 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-600" />
            <span className="text-xs text-zinc-500">Agent Center</span>
          </div>
        </div>
      )}
    </aside>
  );
}
