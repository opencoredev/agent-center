import React from 'react';
import { Outlet, useNavigate, useMatchRoute } from '@tanstack/react-router';
import {
  ArrowLeft,
  User,
  Cpu,
  GitFork,
  Key,
  Building2,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Account',
    items: [
      { label: 'Profile', path: '/settings/profile', icon: User },
    ],
  },
  {
    title: 'Agent',
    items: [
      { label: 'Models', path: '/settings/models', icon: Cpu },
      { label: 'Repositories', path: '/settings/repositories', icon: GitFork },
    ],
  },
  {
    title: 'Developer',
    items: [
      { label: 'API Keys', path: '/settings/api-keys', icon: Key },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { label: 'General', path: '/settings/workspace', icon: Building2 },
    ],
  },
];

export function SettingsLayout() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();

  return (
    <div className="flex h-screen bg-background">
      {/* Settings sidebar */}
      <aside className="w-[220px] shrink-0 border-r border-border bg-sidebar flex flex-col">
        {/* Back button */}
        <div className="p-3">
          <button
            onClick={() => navigate({ to: '/' })}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer w-full"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4" style={{ scrollbarWidth: 'thin' }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-2 mb-1 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = matchRoute({ to: item.path });
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate({ to: item.path })}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Settings content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
