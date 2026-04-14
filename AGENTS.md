# Global Rules

## Core Defaults

- Prefer `bun` and `bunx` over `npm`, `yarn`, `pnpm`, and `npx`.
- Never start dev servers unless explicitly asked.
- Match the existing repo style and architecture before introducing new patterns.
- Prefer Effect for new backend orchestration, async control flow, resource management, and error-handling work. Only skip it when matching an untouched legacy surface is the smaller, safer move.
- Preserve public APIs and current behavior unless the user asks for behavior changes.
- Prefer the smallest robust fix that addresses the root cause.
- Avoid broad rewrites, speculative abstractions, and unrelated cleanup.

## Working Style

- Inspect the relevant files, tests, and surrounding code before editing.
- Adjust depth to task size: stay fast on simple tasks, slow down on risky or ambiguous work.
- For non-trivial changes, run the narrowest relevant validation before saying the work is done.
- If validation cannot be run, say so clearly.
- Be honest about assumptions, tradeoffs, and residual risk.

## Git Workflow

- Prefer `git pull --rebase` before a normal `git pull`.
- If an AI review or external check is in progress, wait for it and address real findings before merging.

## Browser Automation

- Use `agent-browser` for browser automation in this repo.
- Do not use browser MCP servers, `browsermcp`, Playwright MCP, or the `expect` MCP flow here.
- Prefer the native Rust release at `~/.cargo/bin/agent-browser`. If it is missing or outdated, install it with `./scripts/install-agent-browser`.
- Run browser commands through `./scripts/agent-browser` so agents inherit the repo defaults automatically.
- Give every agent its own browser session before testing:
  `export AGENT_BROWSER_SESSION="$(./scripts/agent-browser-session)"`
- Reuse the same session for the whole verification flow, then close only that session when done.
- Never use `agent-browser close --all` unless the user explicitly asks for cleanup across every agent.
- Do not start the dashboard unless the user explicitly asks for it.
- The wrapper sets an idle timeout so unused browser daemons shut themselves down instead of sitting in RAM.

## Orchestrator Triggering

- Only enter orchestrator mode when the user explicitly says a trigger phrase such as `become an orchestrator`, `become an orchestrator agent`, `become an orishare agent`, or a clearly equivalent direct instruction.
- When one of those trigger phrases is used, immediately read and follow the `subagent-orchestration` skill before doing the work.
- While in orchestrator mode, behave according to that skill: plan the phases, dispatch subagents, keep implementation and validation separated, and do not write the code directly unless the user explicitly tells you to stop orchestrating.
- Orchestrator mode is not sticky across unrelated follow-up requests. After the orchestrated task finishes, treat later chat requests normally unless the user explicitly re-triggers orchestrator mode.
- Do not infer orchestrator mode from generic requests like "change this quickly", "fix this", or other normal coding follow-ups. Those should stay in the default workflow unless the user explicitly invokes orchestrator mode again.

## Swarm Skill Triggering

- If the user explicitly says `swarm` or `/swarm`, follow `/swarm` planning/execution guidance by reading and applying `/Users/leo/.codex/skills/swarm/SKILL.md` before acting.
- If the user explicitly says `plan-swarm` or asks for planning-only before execution, read and apply `/Users/leo/.codex/skills/plan-swarm/SKILL.md` before acting.
- Keep these two skills opt-in: do not run them for one-off or single-step requests unless explicitly requested.
- If either keyword appears, confirm to yourself which skill applies (`/swarm` vs `/plan-swarm`) and use the matching skill output format.
- Once `swarm` is explicitly triggered, continue execution until the task is done, the user stops you, or a real blocker requires user input. Do not stop after the first implementation wave just because partial progress was made.
