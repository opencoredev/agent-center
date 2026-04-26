import { notFoundError } from "../http/errors";
import {
  createProject,
  findProjectById,
  findProjectByWorkspaceAndId,
  findProjectByWorkspaceAndSlug,
  listProjects,
} from "../repositories/project-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import { serializeProject } from "./serializers";

function normalizeProjectSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 64) || "project"
  );
}

export const projectService = {
  async list(filters: { workspaceId?: string }) {
    const projects = await listProjects(filters);

    return projects.map(serializeProject);
  },

  async create(input: {
    workspaceId: string;
    slug: string;
    name: string;
    description: string | null;
    defaultBranch: string;
    rootDirectory?: string | null;
    metadata: Record<string, unknown>;
  }) {
    const workspace = await findWorkspaceById(input.workspaceId);

    if (workspace === undefined) {
      throw notFoundError("workspace", input.workspaceId);
    }

    const project = await createProject({
      workspaceId: input.workspaceId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      defaultBranch: input.defaultBranch,
      rootDirectory: input.rootDirectory ?? null,
      metadata: input.metadata,
    });

    return serializeProject(project);
  },

  async getById(projectId: string) {
    const project = await findProjectById(projectId);

    if (project === undefined) {
      throw notFoundError("project", projectId);
    }

    return serializeProject(project);
  },

  async assertWithinWorkspace(workspaceId: string, projectId: string) {
    const project = await findProjectByWorkspaceAndId(workspaceId, projectId);

    if (project === undefined) {
      throw notFoundError("project", projectId);
    }

    return project;
  },

  async findOrCreateRepositoryProject(input: {
    workspaceId: string;
    owner: string;
    repo: string;
    defaultBranch: string;
  }) {
    const workspace = await findWorkspaceById(input.workspaceId);

    if (workspace === undefined) {
      throw notFoundError("workspace", input.workspaceId);
    }

    const slug = normalizeProjectSlug(`${input.owner}-${input.repo}`);
    const existing = await findProjectByWorkspaceAndSlug(input.workspaceId, slug);

    if (existing) {
      return existing;
    }

    return createProject({
      workspaceId: input.workspaceId,
      slug,
      name: `${input.owner}/${input.repo}`,
      description: null,
      defaultBranch: input.defaultBranch,
      rootDirectory: null,
      metadata: {
        source: "repo_connection",
      },
    });
  },
};
