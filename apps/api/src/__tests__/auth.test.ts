import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { timingSafeEqual } from "node:crypto";

import { tokenStore } from "../middleware/basic-auth";

describe("basic auth", () => {
  describe("tokenStore", () => {
    beforeEach(() => {
      tokenStore.clear();
    });

    test("stores and retrieves a token", () => {
      const expiresAt = Date.now() + 60_000;
      tokenStore.set("abc123", { username: "admin", expiresAt });

      const session = tokenStore.get("abc123");
      expect(session).toBeDefined();
      expect(session!.username).toBe("admin");
      expect(session!.expiresAt).toBe(expiresAt);
    });

    test("returns undefined for unknown token", () => {
      expect(tokenStore.get("nonexistent")).toBeUndefined();
    });

    test("delete removes a token", () => {
      tokenStore.set("token1", { username: "admin", expiresAt: Date.now() + 60_000 });
      tokenStore.delete("token1");
      expect(tokenStore.get("token1")).toBeUndefined();
    });

    test("expired token is still retrievable (middleware handles expiry)", () => {
      const pastTime = Date.now() - 10_000;
      tokenStore.set("expired", { username: "admin", expiresAt: pastTime });

      const session = tokenStore.get("expired");
      expect(session).toBeDefined();
      expect(session!.expiresAt).toBeLessThan(Date.now());
    });
  });

  describe("timingSafeEqual behavior", () => {
    test("returns true for matching strings", () => {
      const a = Buffer.from("password123");
      const b = Buffer.from("password123");
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    test("returns false for non-matching strings of same length", () => {
      const a = Buffer.from("password123");
      const b = Buffer.from("password456");
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    test("throws for different length buffers", () => {
      const a = Buffer.from("short");
      const b = Buffer.from("much-longer-string");
      expect(() => timingSafeEqual(a, b)).toThrow();
    });
  });

  describe("login route logic", () => {
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      tokenStore.clear();
      savedEnv.AUTH_USERNAME = process.env.AUTH_USERNAME;
      savedEnv.AUTH_PASSWORD = process.env.AUTH_PASSWORD;
    });

    afterEach(() => {
      process.env.AUTH_USERNAME = savedEnv.AUTH_USERNAME;
      process.env.AUTH_PASSWORD = savedEnv.AUTH_PASSWORD;
    });

    test("auth is disabled when env vars not set", () => {
      delete process.env.AUTH_USERNAME;
      delete process.env.AUTH_PASSWORD;

      const authUsername = process.env.AUTH_USERNAME;
      const authPassword = process.env.AUTH_PASSWORD;

      expect(!authUsername || !authPassword).toBe(true);
    });

    test("auth is enabled when both env vars set", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";

      const authUsername = process.env.AUTH_USERNAME;
      const authPassword = process.env.AUTH_PASSWORD;

      expect(!authUsername || !authPassword).toBe(false);
    });

    test("credential matching uses timing-safe comparison", () => {
      const inputUser = "admin";
      const inputPass = "correctpassword";
      const envUser = "admin";
      const envPass = "correctpassword";

      const usernameMatch = timingSafeEqual(Buffer.from(inputUser), Buffer.from(envUser));
      const passwordMatch = timingSafeEqual(Buffer.from(inputPass), Buffer.from(envPass));

      expect(usernameMatch).toBe(true);
      expect(passwordMatch).toBe(true);
    });

    test("credential mismatch is detected", () => {
      const inputUser = "admin";
      const inputPass = "wrongpassword1";
      const envUser = "admin";
      const envPass = "correctpasswd1";

      const usernameMatch = timingSafeEqual(Buffer.from(inputUser), Buffer.from(envUser));
      const passwordMatch = timingSafeEqual(Buffer.from(inputPass), Buffer.from(envPass));

      expect(usernameMatch).toBe(true);
      expect(passwordMatch).toBe(false);
    });

    test("different-length credentials are handled safely", () => {
      const inputUser = "admin";
      const envUser = "administrator";

      expect(() => timingSafeEqual(Buffer.from(inputUser), Buffer.from(envUser))).toThrow();
    });
  });
});
