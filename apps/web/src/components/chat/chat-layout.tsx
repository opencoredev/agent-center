import React, { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ChatSidebar } from './chat-sidebar';
import { PanelLeft } from 'lucide-react';

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div
        className={`relative flex-shrink-0 transition-all duration-200 ease-in-out ${
          sidebarOpen ? 'w-[220px]' : 'w-0'
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 w-[220px] border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <ChatSidebar onToggle={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-background">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 left-3 z-10 p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
        <Outlet />
      </div>
    </div>
  );
}
