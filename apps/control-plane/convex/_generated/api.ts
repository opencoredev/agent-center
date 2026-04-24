/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as constants from "../constants.js";
import type * as credentials from "../credentials.js";
import type * as files from "../files.js";
import type * as index from "../index.js";
import type * as lib from "../lib.js";
import type * as projects from "../projects.js";
import type * as repoConnections from "../repoConnections.js";
import type * as runs from "../runs.js";
import type * as runtimeProviders from "../runtimeProviders.js";
import type * as sandboxes from "../sandboxes.js";
import type * as serviceApi from "../serviceApi.js";
import type * as tasks from "../tasks.js";
import type * as threads from "../threads.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  constants: typeof constants;
  credentials: typeof credentials;
  files: typeof files;
  index: typeof index;
  lib: typeof lib;
  projects: typeof projects;
  repoConnections: typeof repoConnections;
  runs: typeof runs;
  runtimeProviders: typeof runtimeProviders;
  sandboxes: typeof sandboxes;
  serviceApi: typeof serviceApi;
  tasks: typeof tasks;
  threads: typeof threads;
  workspaces: typeof workspaces;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
