import { notFoundError } from "../http/errors";
import {
  createProject,
  findProjectById,
  findProjectByWorkspaceAndId,
  listProjects,
} from "../repositories/project-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import { serializeProject } from "./serializers";

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
};
