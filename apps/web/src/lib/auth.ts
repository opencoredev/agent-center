const TOKEN_KEY = 'agent_center_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthEnabled(): boolean {
  return import.meta.env.VITE_AUTH_ENABLED === 'true';
}
