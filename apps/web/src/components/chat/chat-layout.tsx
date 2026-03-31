import React, { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ChatSidebar } from './chat-sidebar';
import { PanelLeftClose, PanelLeft } from 'lucide-react';

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface)]">
      {/* Sidebar */}
      <div
        className={`relative flex-shrink-0 transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-72' : 'w-0'
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 w-72 border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] transition-transform duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <ChatSidebar onToggle={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar — only shows sidebar toggle when collapsed */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-10 p-2 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-zinc-400 hover:text-zinc-200 hover:bg-[var(--color-surface-overlay)] transition-colors cursor-pointer"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <Outlet />
      </div>
    </div>
  );
}
