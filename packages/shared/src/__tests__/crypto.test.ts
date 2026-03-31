import { describe, expect, test } from "bun:test";

import { encrypt, decrypt } from "../crypto";

describe("crypto", () => {
  const key = "test-encryption-key";

  test("encrypt returns 3-part colon-separated string", () => {
    const result = encrypt("hello", key);
    const parts = result.split(":");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  test("decrypt returns original plaintext", () => {
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  test("decrypt with wrong key throws", () => {
    const encrypted = encrypt("secret", key);
    expect(() => decrypt(encrypted, "wrong-key")).toThrow(
      "Decryption failed: invalid key or corrupted data",
    );
  });

  test("decrypt with corrupted data throws", () => {
    expect(() => decrypt("not:valid:hex", key)).toThrow(
      "Decryption failed: invalid key or corrupted data",
    );
    expect(() => decrypt("singlepart", key)).toThrow(
      "Decryption failed: invalid key or corrupted data",
    );
    expect(() => decrypt("two:parts", key)).toThrow(
      "Decryption failed: invalid key or corrupted data",
    );
    expect(() => decrypt(":::", key)).toThrow(
      "Decryption failed: invalid key or corrupted data",
    );
  });

  test("each encrypt call returns different ciphertext (random IV)", () => {
    const plaintext = "same input";
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe(plaintext);
    expect(decrypt(b, key)).toBe(plaintext);
  });

  test("encrypt produces output for empty string but decrypt rejects empty ciphertext", () => {
    const encrypted = encrypt("", key);
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe("");
    expect(() => decrypt(encrypted, key)).toThrow(
      "Decryption failed: invalid key or corrupted data",
    );
  });

  test("handles long strings", () => {
    const long = "a".repeat(10_000);
    const encrypted = encrypt(long, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(long);
  });

  test("handles special characters and unicode", () => {
    const special = "Hello 🌍! Ñoño café résumé 日本語 中文 한국어 \n\t\0";
    const encrypted = encrypt(special, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(special);
  });
});
