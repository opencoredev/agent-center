import { Hono } from "hono";

import { SERVICE_NAMES } from "@agent-center/shared";

const healthRoutes = new Hono();

healthRoutes.get("/health", (context) => {
  return context.json({
    service: SERVICE_NAMES.api,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export { healthRoutes };
