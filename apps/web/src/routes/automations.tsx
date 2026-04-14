import React from 'react';
import { Bot, Clock3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';

export function AutomationsPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-8 py-10 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Automations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scheduled and event-driven tasks will live here.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-muted/60 p-3">
            <Bot className="w-6 h-6 text-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-medium text-foreground mb-2">
              This area is not shipped yet
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              The navigation is now real instead of a dead button, but automation builders,
              schedules, and runtime policies still need a dedicated implementation pass.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 mb-6">
              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-foreground">
                  <Clock3 className="w-4 h-4" />
                  Scheduling
                </div>
                <p className="text-xs text-muted-foreground">
                  Cron, interval, and repo-triggered task creation.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-foreground">
                  <RefreshCw className="w-4 h-4" />
                  Runtime Policies
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose which runtime and repository context an automation should use.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate({ to: '/' })}>
              Back To Tasks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
