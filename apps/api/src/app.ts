import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { Hono } from "hono";
import { cors } from "hono/cors";

import { apiEnv } from "./env";
import { ApiError, normalizeError } from "./http/errors";
import { authMiddleware } from "./middleware/auth";
import { requestIdMiddleware } from "./http/request-id";
import { errorResponse } from "./http/responses";
import type { ApiEnv } from "./http/types";
import { apiRoutes } from "./routes/api";
import { healthRoutes } from "./routes/health";
import { internalCredentialRoutes } from "./routes/internal/credentials";
import { registerWebSocketRoutes } from "./ws";

import type { createBunWebSocket } from "hono/bun";

type UpgradeWebSocket = ReturnType<typeof createBunWebSocket>["upgradeWebSocket"];

export function createApp(upgradeWebSocket: UpgradeWebSocket) {
  const app = new Hono<ApiEnv>();

  app.use("*", requestIdMiddleware);

  // ── CORS (for hybrid mode: cloud frontend → self-hosted API) ────────────
  if (apiEnv.CORS_ORIGIN) {
    const origins = apiEnv.CORS_ORIGIN.split(",").map((s) => s.trim());
    app.use(
      "*",
      cors({
        origin: origins,
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["x-request-id"],
      }),
    );
  }

  app.use("*", authMiddleware);

  if (!apiEnv.SERVE_FRONTEND) {
    app.get("/", (context) => context.json({ message: "Agent Center API" }));
  }

  app.route("/", healthRoutes);
  app.route("/api", apiRoutes);
  app.route("/internal/credentials", internalCredentialRoutes);
  registerWebSocketRoutes(app as unknown as Hono, upgradeWebSocket);

  // ── Frontend SPA serving (for self-hosted mode) ─────────────────────────
  if (apiEnv.SERVE_FRONTEND) {
    const distPath = resolve(apiEnv.FRONTEND_DIST_PATH);
    const indexHtml = join(distPath, "index.html");

    if (!existsSync(indexHtml)) {
      console.warn(`[api] SERVE_FRONTEND=true but ${indexHtml} not found. Frontend will not be served.`);
    } else {
      console.log(`[api] serving frontend from ${distPath}`);

      // Serve static assets (JS, CSS, images, etc.)
      app.get("/assets/*", async (context) => {
        const filePath = join(distPath, context.req.path);
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }
        return context.notFound();
      });

      // SPA fallback: serve index.html for all unmatched routes
      app.get("*", async (context) => {
        const file = Bun.file(indexHtml);
        return new Response(file, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      });
    }
  }

  app.notFound((context) => {
    return errorResponse(context, new ApiError(404, "not_found", "Route not found"));
  });

  app.onError((error, context) => {
    const normalizedError = normalizeError(error);

    if (normalizedError.status >= 500) {
      console.error("[api] unhandled error", error);
    }

    return errorResponse(context, normalizedError);
  });

  return app;
}
