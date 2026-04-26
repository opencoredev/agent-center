import { notFoundError } from "../http/errors";
import {
  createWorkspace,
  findWorkspaceById,
  listWorkspaces,
} from "../repositories/workspace-repository";
import { serializeWorkspace } from "./serializers";

function canUseOwnerlessWorkspace(userId?: string) {
  return process.env.NODE_ENV !== "production" && userId !== undefined;
}

function assertWorkspaceAccess(workspace: Record<string, any>, userId?: string) {
  if (!userId || workspace.ownerId === userId) {
    return;
  }

  if (workspace.ownerId === undefined && canUseOwnerlessWorkspace(userId)) {
    return;
  }

  throw notFoundError("workspace", workspace.id);
}

export const workspaceService = {
  async list(userId?: string) {
    const workspaces = await listWorkspaces();
    const accessibleWorkspaces = userId
      ? workspaces.filter(
          (workspace) =>
            workspace.ownerId === userId ||
            (workspace.ownerId === undefined && canUseOwnerlessWorkspace(userId)),
        )
      : workspaces;

    return accessibleWorkspaces.map(serializeWorkspace);
  },

  async create(
    input: {
      slug: string;
      name: string;
      description: string | null;
      metadata: Record<string, unknown>;
    },
    userId?: string,
  ) {
    const workspace = await createWorkspace({
      slug: input.slug,
      name: input.name,
      description: input.description,
      metadata: input.metadata,
      ownerId: userId,
    });

    return serializeWorkspace(workspace);
  },

  async getById(workspaceId: string, userId?: string) {
    const workspace = await findWorkspaceById(workspaceId);

    if (workspace === undefined) {
      throw notFoundError("workspace", workspaceId);
    }

    assertWorkspaceAccess(workspace, userId);

    return serializeWorkspace(workspace);
  },
};
