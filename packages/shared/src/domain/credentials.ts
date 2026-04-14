/**
 * Credential types for provider authentication.
 *
 * Supports two flows:
 *   1. API key — user provides key from the provider's console
 *   2. OAuth — user signs in with their subscription (Claude, Codex)
 *      Claude OAuth creates an API key via the token; Codex stores
 *      access + refresh tokens from the local CLI auth.
 */

/** Source of the credential */
export type CredentialSource = "api_key" | "oauth";

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

export type ResolvedCredential =
  | {
      /** Type of credential */
      type: "api_key";
      /** The actual API key value */
      value: string;
    }
  | {
      /** Serialized auth.json content for Codex OAuth auth */
      type: "auth_json";
      /** The auth.json payload */
      value: string;
    };
