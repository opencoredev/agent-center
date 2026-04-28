import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { getApiUrl } from "@/lib/config";
import { useAuth } from "@/contexts/auth-context";

type AuthMode = "login" | "signup";

interface AuthPageProps {
  mode: AuthMode;
}

function getAuthCopy(mode: AuthMode) {
  if (mode === "signup") {
    return {
      title: "Create your account",
      description: "Use your email and password to start building with Agent Center.",
      button: "Sign up",
      loading: "Creating account...",
      alternateText: "Already have an account?",
      alternateAction: "Sign in",
      alternateHref: "/login",
      passwordAutocomplete: "new-password",
    };
  }

  return {
    title: "Login to your account",
    description: "Enter your email below to continue to Agent Center.",
    button: "Login",
    loading: "Logging in...",
    alternateText: "Don't have an account?",
    alternateAction: "Sign up",
    alternateHref: "/signup",
    passwordAutocomplete: "current-password",
  };
}

function getErrorMessage(status: number, mode: AuthMode) {
  if (status === 401) {
    return "Invalid credentials";
  }

  if (status === 409) {
    return "That email is already in use";
  }

  if (status === 403) {
    return "Sign up is currently disabled";
  }

  return `${mode === "login" ? "Login" : "Sign up"} failed (${status})`;
}

export function AuthPage({ mode }: AuthPageProps) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const copy = getAuthCopy(mode);
  const [email, setEmail] = useState("");
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
      window.history.replaceState({}, "", window.location.pathname);
      void navigate({ to: "/" });
    }

    if (oauthError) {
      setError(`OAuth failed: ${oauthError}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [login, navigate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        let message = getErrorMessage(res.status, mode);
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          message = body.error?.message ?? message;
        } catch {
          // Keep the status fallback when the response is not JSON.
        }
        setError(message);
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
  }

  function handleGitHubLogin() {
    window.location.href = `${getApiUrl()}/api/auth/github/start`;
  }

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="flex min-h-svh flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link to="/" className="flex items-center gap-2 font-medium">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" />
            Agent Center
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">{copy.title}</h1>
                <p className="text-balance text-sm text-muted-foreground">{copy.description}</p>
              </div>
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={copy.passwordAutocomplete}
                  />
                </div>
                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? copy.loading : copy.button}
                </Button>
                <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                  <span className="relative z-10 bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGitHubLogin}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                    <path
                      fill="currentColor"
                      d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.754-1.335-1.754-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                    />
                  </svg>
                  Continue with GitHub
                </Button>
              </div>
              <div className="text-center text-sm">
                {copy.alternateText}{" "}
                <Link to={copy.alternateHref} className="underline underline-offset-4">
                  {copy.alternateAction}
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div className="hidden bg-muted lg:block" aria-hidden="true" />
    </div>
  );
}

export function LoginPage() {
  return <AuthPage mode="login" />;
}
