import { createBunWebSocket } from "hono/bun";

import { createApp } from "./app";
import { apiEnv } from "./env";

const { upgradeWebSocket, websocket } = createBunWebSocket();
const app = createApp(upgradeWebSocket);

const server = Bun.serve({
  fetch: app.fetch,
  hostname: apiEnv.API_HOST,
  port: apiEnv.API_PORT,
  websocket,
});

console.log(`[api] listening on http://${server.hostname}:${server.port} (${apiEnv.NODE_ENV})`);
console.log("[api] websocket endpoint available at /ws");

