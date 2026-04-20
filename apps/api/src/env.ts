import { z } from "zod";
import { host, loadRootEnv, nodeEnv, parseEnv, port } from "@agent-center/config";

loadRootEnv();

export const apiEnv = parseEnv(
  {
    API_HOST: process.env.API_HOST,
    API_PORT: process.env.PORT || process.env.API_PORT,
    NODE_ENV: process.env.NODE_ENV,
    CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    SERVE_FRONTEND: process.env.SERVE_FRONTEND,
    FRONTEND_DIST_PATH: process.env.FRONTEND_DIST_PATH,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    GITHUB_APP_CALLBACK_URL: process.env.GITHUB_APP_CALLBACK_URL,
    GITHUB_APP_SETUP_URL: process.env.GITHUB_APP_SETUP_URL,
  },
  {
    API_HOST: host.default("0.0.0.0"),
    API_PORT: port.default(3000),
    NODE_ENV: nodeEnv,
    CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    SERVE_FRONTEND: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    FRONTEND_DIST_PATH: z.string().default("../web/dist"),
    GITHUB_APP_ID: z.string().trim().regex(/^\d+$/).optional(),
    GITHUB_APP_SLUG: z.string().trim().optional(),
    GITHUB_APP_CLIENT_ID: z.string().trim().optional(),
    GITHUB_APP_CLIENT_SECRET: z.string().trim().optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().trim().optional(),
    GITHUB_WEBHOOK_SECRET: z.string().trim().optional(),
    GITHUB_APP_CALLBACK_URL: z.string().trim().optional(),
    GITHUB_APP_SETUP_URL: z.string().trim().optional(),
  },
);
