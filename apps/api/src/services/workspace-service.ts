import { notFoundError } from "../http/errors";
import {
  createWorkspace,
  findWorkspaceById,
  listWorkspaces,
} from "../repositories/workspace-repository";
import { serializeWorkspace } from "./serializers";

export const workspaceService = {
  async list() {
    const workspaces = await listWorkspaces();

    return workspaces.map(serializeWorkspace);
  },

  async create(input: {
    slug: string;
    name: string;
    description: string | null;
    metadata: Record<string, unknown>;
  }) {
    const workspace = await createWorkspace({
      slug: input.slug,
      name: input.name,
      description: input.description,
      metadata: input.metadata,
    });

    return serializeWorkspace(workspace);
  },

  async getById(workspaceId: string) {
    const workspace = await findWorkspaceById(workspaceId);

    if (workspace === undefined) {
      throw notFoundError("workspace", workspaceId);
    }

    return serializeWorkspace(workspace);
  },
};
