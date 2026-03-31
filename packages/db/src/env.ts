import { z } from "zod";

import { loadRootEnv, parseEnv } from "@agent-center/config";

loadRootEnv();

export const dbEnv = parseEnv(
  {
    DATABASE_URL: process.env.DATABASE_URL,
  },
  {
    DATABASE_URL: z.string().url(),
  },
);
