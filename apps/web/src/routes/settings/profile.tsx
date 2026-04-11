import React from 'react';
import { User } from 'lucide-react';

export function ProfilePage() {
  return (
    <div className="max-w-2xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Profile picture */}
      <section className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">Profile Picture</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              How you're shown around the app
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-foreground mb-1">Appearance</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Choose your preferred theme
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(['Auto', 'Light', 'Dark'] as const).map((theme) => (
            <button
              key={theme}
              className={`rounded-lg border p-3 text-center text-sm transition-colors cursor-pointer ${
                theme === 'Dark'
                  ? 'border-primary bg-accent text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/50'
              }`}
            >
              <div className="w-full h-16 rounded-md bg-muted/30 border border-border/50 mb-2" />
              {theme}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
