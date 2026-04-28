import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";

type AuthMode = "login" | "signup";

interface AuthPageProps {
  mode: AuthMode;
}

function getAuthCopy(mode: AuthMode) {
  if (mode === "signup") {
    return {
      title: "Create your account",
      description: "Choose a username and password to start building with Agent Center.",
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
    description: "Enter your credentials below to continue to Agent Center.",
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
    return "That username is already taken";
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
        body: JSON.stringify({ username, password }),
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
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="leo"
                    required
                    autoComplete="username"
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
