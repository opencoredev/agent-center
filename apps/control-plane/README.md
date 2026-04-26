# Control Plane

This workspace is the Convex foundation for the rewrite.

It is intentionally small at first: the goal is to establish the durable data model, realtime function surface, and provider/runtime boundaries before we migrate the rest of the product onto it.

What lives here:

- schema for tasks, runs, run events, threads, messages, sandboxes, runtime providers, repo connections, credentials, projects, and workspaces
- minimal Convex queries and mutations for the new control-plane contract
- a package boundary that lets the rest of the monorepo migrate toward Convex one slice at a time

What does not live here yet:

- the full migration of the current API, worker, or runner services
- product UI integration
- production auth and tenancy rules

Use this workspace as the source of truth for the new state model while the rest of the stack is moved over incrementally.

## Local Service Token

The API, worker, runner, and Convex functions must share `AGENT_CENTER_CONVEX_SERVICE_TOKEN`.

For local development, generate a token in the repo root `.env`:

```bash
openssl rand -hex 32
```

Then set the same value on the Convex dev deployment so `process.env.AGENT_CENTER_CONVEX_SERVICE_TOKEN` is available inside control-plane functions:

```bash
bunx convex env set AGENT_CENTER_CONVEX_SERVICE_TOKEN "$(grep '^AGENT_CENTER_CONVEX_SERVICE_TOKEN=' .env | cut -d= -f2-)"
```
