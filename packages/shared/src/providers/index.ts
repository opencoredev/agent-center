export const REPO_PROVIDERS = ["github"] as const satisfies readonly [string, ...string[]];

export const REPO_AUTH_TYPES = ["pat"] as const satisfies readonly [string, ...string[]];

export type RepoProvider = (typeof REPO_PROVIDERS)[number];
export type RepoAuthType = (typeof REPO_AUTH_TYPES)[number] | (string & {});

export * from "./contracts";
