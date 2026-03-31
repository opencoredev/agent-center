import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * Derives a 32-byte key from any string input using SHA-256
 */
function deriveKey(key: string): Buffer {
  return createHash("sha256").update(Buffer.from(key)).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM
 * Returns format: "iv_hex:ciphertext_hex:tag_hex"
 */
export function encrypt(plaintext: string, key: string): string {
  const derivedKey = deriveKey(key);
  const iv = randomBytes(16);

  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${ciphertext.toString("hex")}:${tag.toString("hex")}`;
}

/**
 * Decrypts AES-256-GCM encrypted data
 * Expects format: "iv_hex:ciphertext_hex:tag_hex"
 * Throws if decryption fails (wrong key or corrupted data)
 */
export function decrypt(encrypted: string, key: string): string {
  const derivedKey = deriveKey(key);
  const parts = encrypted.split(":");

  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("Decryption failed: invalid key or corrupted data");
  }

  const iv = Buffer.from(parts[0]!, "hex");
  const ciphertext = Buffer.from(parts[1]!, "hex");
  const tag = Buffer.from(parts[2]!, "hex");

  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf-8");
  } catch {
    throw new Error("Decryption failed: invalid key or corrupted data");
  }
}
