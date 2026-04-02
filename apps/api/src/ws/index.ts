import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSMessageReceive } from "hono/ws";

import { RunEventsHub } from "./run-events-hub";

type UpgradeWebSocket = ReturnType<typeof createBunWebSocket>["upgradeWebSocket"];

export const runEventsHub = new RunEventsHub();

export function registerWebSocketRoutes(app: Hono, upgradeWebSocket: UpgradeWebSocket) {
  app.get(
    "/ws",
    upgradeWebSocket(() => {
      return {
        onOpen(_event, socket) {
          runEventsHub.register(socket);
        },
        async onMessage(event, socket) {
          await runEventsHub.handleMessage(socket, await toTextMessage(event.data));
        },
        onClose(_event, socket) {
          runEventsHub.unregister(socket);
          console.log("[api] websocket connection closed");
        },
      };
    }),
  );
}

async function toTextMessage(data: WSMessageReceive): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Blob) {
    return await data.text();
  }

  return Buffer.from(data).toString("utf8");
}
