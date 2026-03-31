import React from 'react';
import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
