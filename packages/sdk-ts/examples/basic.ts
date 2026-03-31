import { createAgentCenterClient } from "../src/index.js";

const environment = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
    exitCode?: number;
  };
};

async function main() {
  const baseUrl = environment.process?.env?.AGENT_CENTER_BASE_URL ?? "http://127.0.0.1:3000";
  const githubToken = environment.process?.env?.AGENT_CENTER_GITHUB_TOKEN;
  const suffix = Date.now().toString(36);

  const client = createAgentCenterClient({
    baseUrl,
  });

  const workspace = await client.workspaces.create({
    description: "Created by the SDK example script.",
    name: `SDK Workspace ${suffix}`,
    slug: `sdk-workspace-${suffix}`,
  });

  const project = await client.projects.create({
    defaultBranch: "main",
    description: "Example project created by the SDK.",
    name: `SDK Project ${suffix}`,
    slug: `sdk-project-${suffix}`,
    workspaceId: workspace.id,
  });

  const repoConnection = await client.repoConnections.create({
    authType: "pat",
    connectionMetadata: githubToken === undefined ? {} : { token: githubToken },
    owner: "octocat",
    projectId: project.id,
    provider: "github",
    repo: "Spoon-Knife",
    workspaceId: workspace.id,
  });

  const repoCheck = await client.repoConnections.test(repoConnection.id);
  const baseBranch = repoCheck.repository?.defaultBranch ?? "main";

  const task = await client.tasks.create({
    baseBranch,
    config: {
      commands: [
        {
          command: "echo 'hello from the SDK example'",
        },
      ],
    },
    projectId: project.id,
    prompt: "Create a short summary of the repository state and exit.",
    repoConnectionId: repoConnection.id,
    title: `SDK Task ${suffix}`,
    workspaceId: workspace.id,
  });

  const run = await client.runs.create({
    baseBranch,
    taskId: task.id,
  });

  console.log("workspace", workspace.id);
  console.log("project", project.id);
  console.log("repoConnection", repoConnection.id);
  console.log("task", task.id);
  console.log("run", run.id);

  const stream = client.runs.stream(run.id);
  const timeoutId = setTimeout(() => {
    void stream.close();
  }, 30_000);

  try {
    for await (const event of stream) {
      console.log(`[${event.sequence}] ${event.eventType}`, event.message ?? "");

      if (event.eventType === "run.completed" || event.eventType === "run.failed") {
        break;
      }
    }
  } finally {
    clearTimeout(timeoutId);
    await stream.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);

  if (environment.process !== undefined) {
    environment.process.exitCode = 1;
  }
});
