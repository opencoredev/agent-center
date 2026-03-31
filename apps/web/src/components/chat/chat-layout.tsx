import React, { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ChatSidebar } from './chat-sidebar';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div
        className={`relative flex-shrink-0 transition-[width] duration-200 ease-in-out border-r border-sidebar-border ${
          sidebarOpen ? 'w-64' : 'w-0 border-r-0'
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 w-64 bg-sidebar overflow-hidden transition-transform duration-200 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <ChatSidebar onCollapse={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-2.5 left-2.5 z-10 h-8 w-8"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        )}
        <Outlet />
      </div>
    </div>
  );
}
