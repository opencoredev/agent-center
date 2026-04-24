import React, { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { getApiUrl } from "@/lib/config";
import { useAuth } from "@/contexts/auth-context";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hashParams.get("token") ?? params.get("token");
    const oauthError = params.get("error");

    if (token) {
      login(token);
      window.history.replaceState({}, "", "/login");
      void navigate({ to: "/" });
    }

    if (oauthError) {
      setError(`OAuth failed: ${oauthError}`);
      window.history.replaceState({}, "", "/login");
    }
  }, [login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 401) {
        setError("Invalid credentials");
        return;
      }

      if (!res.ok) {
        setError(`Login failed (${res.status})`);
        return;
      }

      const json = (await res.json()) as { data: { token: string } };
      login(json.data.token);
      await navigate({ to: "/" });
    } catch {
      setError("Unable to connect");
    } finally {
      setLoading(false);
    }
  };

  function handleGoogleLogin() {
    window.location.href = `${getApiUrl()}/api/auth/google/start`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--muted)_0%,var(--background)_50%)] px-4">
      <div className="w-full max-w-sm animate-page-enter">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Agent Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to continue</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Google OAuth */}
            <Button type="button" variant="outline" onClick={handleGoogleLogin} className="w-full">
              Continue with Google
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Basic auth */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
                autoComplete="username"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="current-password"
              />
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
