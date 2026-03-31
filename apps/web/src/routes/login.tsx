import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  // Handle OAuth callback: /login?token=sess_xxx
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
        setError('Invalid username or password');
        return;
      }

      if (!res.ok) {
        setError(`Login failed (${res.status})`);
        return;
      }

      const json = (await res.json()) as { data: { token: string; expiresAt: string } };
      login(json.data.token);
      await navigate({ to: '/' });
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  function handleGoogleLogin() {
    window.location.href = `${getApiUrl()}/api/auth/google/start`;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center pb-2">
          <div className="text-2xl mb-1">⬡</div>
          <CardTitle className="text-xl text-zinc-50">Agent Center</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Google OAuth */}
          <Button
            type="button"
            variant="outline"
            className="w-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            onClick={handleGoogleLogin}
          >
            Continue with Google
          </Button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-500">or sign in with credentials</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Basic auth form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-zinc-400" htmlFor="username">
                Username
              </label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-50 placeholder:text-zinc-500"
                placeholder="admin"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-zinc-400" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-50 placeholder:text-zinc-500"
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
