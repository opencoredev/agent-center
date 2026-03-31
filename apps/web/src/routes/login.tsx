import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Zap, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { getApiUrl } from '@/lib/config';
import { useAuth } from '@/contexts/auth-context';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const oauthError = params.get('error');

    if (token) {
      login(token);
      window.history.replaceState({}, '', '/login');
      void navigate({ to: '/' });
    }

    if (oauthError) {
      setError(`OAuth failed: ${oauthError}`);
      window.history.replaceState({}, '', '/login');
    }
  }, [login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 401) {
        setError('Invalid credentials');
        return;
      }

      if (!res.ok) {
        setError(`Login failed (${res.status})`);
        return;
      }

      const json = (await res.json()) as { data: { token: string } };
      login(json.data.token);
      await navigate({ to: '/' });
    } catch {
      setError('Unable to connect');
    } finally {
      setLoading(false);
    }
  };

  function handleGoogleLogin() {
    window.location.href = `${getApiUrl()}/api/auth/google/start`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] px-4">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent)]/15 border border-[var(--color-border-default)] flex items-center justify-center mb-4">
            <Zap className="w-5 h-5 text-[var(--color-accent)]" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-200">Agent Center</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in to continue</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-6 space-y-4">
          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium
              text-zinc-300 bg-white/[0.04] border border-[var(--color-border-default)]
              hover:bg-white/[0.07] transition-all cursor-pointer"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--color-border-subtle)]" />
            <span className="text-[11px] text-zinc-600 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[var(--color-border-subtle)]" />
          </div>

          {/* Basic auth */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
              className="w-full h-10 px-3 rounded-xl text-sm bg-white/[0.03] border border-[var(--color-border-subtle)] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[var(--color-border-strong)] transition-colors"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full h-10 px-3 rounded-xl text-sm bg-white/[0.03] border border-[var(--color-border-subtle)] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[var(--color-border-strong)] transition-colors"
            />
            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-xl text-sm font-medium
                bg-[var(--color-accent)] text-zinc-950
                hover:brightness-110 transition-all cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
