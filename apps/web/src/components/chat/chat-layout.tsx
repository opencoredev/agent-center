import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ChatSidebar } from './chat-sidebar';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

const SIDEBAR_WIDTH_KEY = 'agent_center_sidebar_width';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const MOBILE_BREAKPOINT = 768;

function getStoredWidth(): number {
  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) return parsed;
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_WIDTH;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(getStoredWidth);
  const [isResizing, setIsResizing] = useState(false);
  const isMobile = useIsMobile();

  const persistWidth = useCallback((width: number) => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      // noop
    }
  }, []);

  // ── Resize handle ──────────────────────────────────────────
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const delta = e.clientX - startX.current;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
    setSidebarWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.classList.remove('sidebar-resizing');
    setSidebarWidth((w) => {
      persistWidth(w);
      return w;
    });
  }, [persistWidth]);

  useEffect(() => {
    if (!isResizing) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      setIsResizing(true);
      document.body.classList.add('sidebar-resizing');
    },
    [sidebarWidth]
  );

  // ── Keyboard shortcut: Cmd+B / Ctrl+B ─────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const state = sidebarOpen ? 'open' : 'closed';

  // ── Mobile: Sheet overlay ──────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[300px] p-0 bg-sidebar [&>button]:hidden">
            <ChatSidebar onCollapse={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex-1 flex flex-col min-w-0 relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="sidebar-toggle absolute top-2.5 left-2.5 z-10 h-8 w-8"
            data-visible={!sidebarOpen}
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
          <Outlet />
        </div>
      </div>
    );
  }

  // ── Desktop: position-animated sidebar ─────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Spacer div: smoothly animates width to push main content */}
      <div
        className="sidebar-spacer"
        data-state={state}
        style={{ width: sidebarOpen ? sidebarWidth : 0 }}
      />

      {/* Sidebar panel: positioned with left, not display */}
      <div
        className="sidebar-panel bg-sidebar border-r border-sidebar-border z-30"
        data-state={state}
        style={{
          width: sidebarWidth,
          left: sidebarOpen ? 0 : -sidebarWidth,
        }}
      >
        <div className="sidebar-inner h-full">
          <ChatSidebar onCollapse={() => setSidebarOpen(false)} />
        </div>

        {/* Resize handle */}
        {sidebarOpen && (
          <div
            onMouseDown={onResizeStart}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-20 hover:bg-ring/50 transition-colors"
          />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="sidebar-toggle absolute top-2.5 left-2.5 z-10 h-8 w-8"
          data-visible={!sidebarOpen}
        >
          <PanelLeft className="w-4 h-4" />
        </Button>
        <Outlet />
      </div>
    </div>
  );
}
