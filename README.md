# Agent Center

Agent Center is a Bun monorepo for a self-hosted control plane around background coding runs.

This repository is no longer just a scaffold. The current phase is a backend vertical slice with real persistence, queueing, local execution, GitHub repository connections, automations, and realtime run events. It is still intentionally early: there is no product frontend, no auth layer, and no secure sandbox yet.

## What This Phase Includes

- Postgres-backed CRUD APIs for workspaces, projects, repo connections, tasks, runs, and automations
- A worker that polls Postgres for queued runs and due automations
- A host-local runner that provisions a workspace, optionally clones a GitHub repository, and executes configured shell commands
- Run events and logs persisted in Postgres and streamed over WebSockets
- A `@agent-center/github` package for GitHub repo access checks and clone URL construction
- A `@agent-center/sdk-ts` package for HTTP + realtime access from TypeScript

## What This Phase Does Not Include

- No frontend product surface beyond the placeholder `apps/web`
- No user auth, API auth, RBAC, or tenant isolation
- No secure sandbox or VM/container isolation
- No LLM orchestration yet
- No GitHub App, OAuth flow, webhook ingestion, or production-grade secret management
- No commit, push, or PR execution in the runner yet

## Current Architecture

```text
clients / scripts / SDK
        |
        v
apps/api
  - REST API for workspaces, projects, repo connections, tasks, runs, automations
  - WebSocket endpoint for run event subscriptions
  - Reads from and writes to Postgres
        |
        v
Postgres
  - source of truth for tasks, runs, run_events, automations, repo connections, projects, workspaces
        |
        +--> apps/worker
        |     - polls queued runs
        |     - polls due automations
        |     - dispatches accepted runs to the runner over HTTP
        |
        +--> apps/runner
              - loads run state from Postgres
              - creates a local workspace on disk
              - optionally clones a GitHub repo
              - executes configured shell commands
              - writes status, logs, and events back to Postgres
```

### Service Breakdown

- `apps/api`: Bun + Hono API on `http://127.0.0.1:3000` by default. Exposes `/api/*`, `/health`, and `/ws`.
- `apps/worker`: background poller. It claims queued runs, marks dispatch results, and materializes due automations into tasks + runs.
- `apps/runner`: local execution service on `http://127.0.0.1:3002` by default. It exposes internal-only run control routes and executes shell commands on the host machine.
- `packages/db`: Drizzle schema, migrations, and shared Postgres client.
- `packages/github`: GitHub provider helpers for repo access checks, token fallback handling, and authenticated clone URLs.
- `packages/sdk-ts`: typed client for the API plus a realtime stream client for run events.

## Important Phase Reality

The `prompt` field is stored on tasks and runs, but it is not interpreted by an LLM in this phase.

Actual execution comes from `config.commands`. If a run has no commands, the runner fails it.

Fields such as `commitMessage`, `prTitle`, and `prBody` are also stored for future phases, but the current runner does not commit, push, or open pull requests.

## Prerequisites

- Bun `1.3.5` or newer
- Postgres `16+`, or Docker Desktop if you want to use the included compose setup
- `git` available on your machine for repository-backed runs

## Install

```bash
bun install
```

## Environment Setup

All services load the root `.env` file.

```bash
cp .env.example .env
```

The example file includes the current env surface for:

- database access
- API host/port
- worker polling + runner dispatch
- runner host/port + local workspace path
- optional GitHub token fallbacks

If you want runner workspaces in a deterministic location, set `RUNNER_WORKSPACE_ROOT` to an absolute path. The example uses a relative path for local convenience.

## Database Setup

If you want to use the included Postgres container:

```bash
bun run db:up
```

Apply the current migrations:

```bash
bun run db:migrate
```

Stop the container later with:

```bash
bun run db:down
```

## Start The Backend Slice

Run all three backend services together:

```bash
bun run dev
```

Or run them separately:

```bash
bun run dev:api
bun run dev:worker
bun run dev:runner
```

## API Surface

Current resource groups:

- `/api/workspaces`
- `/api/projects`
- `/api/repo-connections`
- `/api/tasks`
- `/api/runs`
- `/api/automations`

Supporting endpoints:

- `GET /health`
- `GET /ws`

The API is intentionally unauthenticated in this phase. Do not expose it directly to untrusted networks.

## How Local Runner Execution Works

End-to-end run flow today:

1. A client creates a task and then creates a run for that task.
2. The API stores the run in Postgres with status `queued`.
3. The worker polls for queued runs, claims one, marks it `provisioning`, and dispatches the `runId` to the runner over `POST /internal/runs/execute`.
4. The runner loads the run, task, project, workspace, and repo connection from Postgres.
5. The runner creates a local workspace directory for the run.
6. If the run has a repo connection, the runner clones the repository and checks out the target branch.
7. The runner executes `config.commands` sequentially with `/bin/zsh -lc`.
8. Stdout, stderr, status transitions, and lifecycle events are written back to Postgres as `run_events`.
9. The API exposes those events over REST and WebSocket subscriptions.

Execution details that matter:

- Commands run as the same local user that started the runner.
- The runner inherits the host process environment.
- `permissionMode: "safe"` is a blocklist, not a sandbox.
- `permissionMode: "yolo"` skips command blocking entirely.
- `permissionMode: "custom"` only blocks commands listed in `policy.blockedCommands`.
- `RUNNER_CLEANUP_MODE=retain` keeps workspaces after completion. `delete_on_completion` removes successful or cancelled workspaces, but failed workspaces are still retained for debugging.

## How GitHub Setup Works

GitHub support in this phase is repository access only.

What is implemented:

- provider: GitHub only
- auth shape: PAT-style tokens
- repo connection creation and persistence
- repo access test via the GitHub API
- clone URL generation for the runner
- private repo cloning when a token is available

What is not implemented yet:

- GitHub App auth
- OAuth connect flow
- webhook ingestion
- automatic commit, push, or PR creation from runner output

Token resolution order for GitHub operations:

1. direct token passed to the provider
2. repo connection metadata such as `token`, `accessToken`, `pat`, or `personalAccessToken`
3. process env fallback from `GITHUB_TOKEN`, `GITHUB_PAT`, or `GH_TOKEN`

For local development, the usual path is:

1. Put a PAT in `.env` as `GITHUB_TOKEN`.
2. Create a repo connection through `/api/repo-connections`.
3. Optionally call `/api/repo-connections/:id/test` to verify access before creating tasks.

Public repositories can work without a token for some operations, but private repository access requires a token.

## Run A Real Task Locally

### Fastest Path: No GitHub Required

This path proves the queue, worker, runner, and event pipeline without cloning a repository.

1. Create a workspace:

```bash
curl -s http://127.0.0.1:3000/api/workspaces \
  -H 'content-type: application/json' \
  -d '{
    "slug": "local-dev",
    "name": "Local Dev",
    "description": "Local smoke test",
    "metadata": {}
  }'
```

2. Copy the returned `workspace.id`, then create a task with commands:

```bash
curl -s http://127.0.0.1:3000/api/tasks \
  -H 'content-type: application/json' \
  -d '{
    "workspaceId": "REPLACE_WITH_WORKSPACE_ID",
    "title": "Runner smoke test",
    "prompt": "Stored for future agent work; commands do the real work in this phase.",
    "permissionMode": "safe",
    "config": {
      "commands": [
        { "command": "pwd" },
        { "command": "echo hello-from-agent-center" },
        { "command": "ls -la" }
      ]
    },
    "metadata": {}
  }'
```

3. Copy the returned `task.id`, then queue a run:

```bash
curl -s http://127.0.0.1:3000/api/runs \
  -H 'content-type: application/json' \
  -d '{
    "taskId": "REPLACE_WITH_TASK_ID"
  }'
```

4. Watch the run over REST:

```bash
curl -s http://127.0.0.1:3000/api/runs/REPLACE_WITH_RUN_ID/events
curl -s http://127.0.0.1:3000/api/runs/REPLACE_WITH_RUN_ID/logs
```

### GitHub-Backed Path

If you want the runner to clone a repository first:

1. Set `GITHUB_TOKEN` in `.env` if you need private repository access.
2. Create a workspace.
3. Create a project for that workspace.
4. Create a GitHub repo connection with the project id.
5. Optionally test the repo connection.
6. Create a task that references `repoConnectionId` and includes `config.commands`.
7. Create a run for that task.

The repository-backed SDK example in [`packages/sdk-ts/examples/basic.ts`](/Users/leo/projects/agent.center/packages/sdk-ts/examples/basic.ts) exercises that full path.

```bash
bun run packages/sdk-ts/examples/basic.ts
```

Useful env vars for the example:

- `AGENT_CENTER_BASE_URL`
- `AGENT_CENTER_GITHUB_TOKEN`

## How WebSocket Subscriptions Work

The API exposes a WebSocket endpoint at `ws://127.0.0.1:3000/ws`.

Client messages:

- `{"type":"subscribe_run","runId":"..."}`
- `{"type":"unsubscribe_run","runId":"..."}`
- `{"type":"ping"}`

Server messages:

- `{"type":"subscribed","runId":"..."}`
- `{"type":"run_event","runId":"...","event":{...}}`
- `{"type":"pong"}`
- `{"type":"error","message":"..."}`

Current implementation details:

- subscriptions are in-memory inside the API process
- the API polls Postgres for new `run_events` every second
- events are delivered in sequence order per run
- there is no resume token, pub/sub bus, or multi-node fanout yet

If you are consuming from TypeScript, use `client.runs.stream(runId)` from `@agent-center/sdk-ts`.

## How Automations Work

Automations are Postgres-backed cron definitions processed by the worker.

Current behavior:

- the worker polls for due automations on an interval
- cron parsing is local to the worker and expects a standard 5-field expression
- if an automation has `nextRunAt = null`, the worker initializes it on first poll instead of firing immediately
- when an automation is due, the worker creates a task and a queued run
- the automation can attach a repo connection and can generate a timestamped branch name from `branchPrefix`

What automations do not do yet:

- no GitHub webhook triggers
- no external scheduler
- no distributed locking beyond the current database transaction flow
- no commit/push/PR step after command execution

## Intentionally Limited Or Unsafe In This Phase

- The runner is host-local and executes shell commands directly on your machine.
- There is no container, VM, namespace, or filesystem isolation boundary.
- Command blocking is lightweight and easy to bypass compared with real sandboxing.
- The API and runner internal endpoints do not require authentication.
- Secrets are simple environment variables or stored repo connection metadata.
- WebSocket delivery is polling-based and single-process.
- Worker scheduling is polling-based, not queue-broker-based.

Treat this phase as a local backend slice and integration harness, not a production-secure control plane.

## Deferred Work

- real agent orchestration from prompts
- secure runner isolation
- multi-runner scheduling and heartbeats
- Git commit / push / PR execution flow
- GitHub App and OAuth-based auth
- frontend product experience
- production auth, billing, and org management
- hardened observability, auditing, and operational controls

## Handy Commands

```bash
bun run dev
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run db:generate
bun run db:migrate
```
