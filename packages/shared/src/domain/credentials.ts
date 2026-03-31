/**
 * Credential types for API key authentication.
 *
 * OAuth-based subscription credentials are NOT supported — Anthropic's TOS
 * prohibits third-party apps from implementing Claude OAuth or routing
 * requests through subscription tokens.  Users should either:
 *   1. Provide an API key from console.anthropic.com, or
 *   2. Authenticate the host's Claude CLI (`claude auth login`) so the
 *      Agent SDK picks up the local session automatically.
 */

/** Source of the credential */
export type CredentialSource = "api_key";

export interface CredentialStatus {
  /** Whether the credential is currently connected/valid */
  connected: boolean;
  /** Source of the credential */
  source: CredentialSource | null;
  /** Associated email address */
  email: string | null;
  /** Token expiration time as ISO string */
  expiresAt: string | null;
  /** Subscription type */
  subscriptionType: string | null;
}

export interface ResolvedCredential {
  /** Type of credential */
  type: "api_key";
  /** The actual API key value */
  value: string;
}
