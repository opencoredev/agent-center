import { beforeEach, describe, expect, mock, test } from "bun:test";

const existingWorkspace = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "existing",
  name: "Existing Workspace",
  description: null,
  metadata: {},
  ownerId: "user-existing",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const createdWorkspace = {
  id: "22222222-2222-2222-2222-222222222222",
  slug: "personal-created",
  name: "Personal Workspace",
  description: null,
  metadata: {},
  ownerId: "user-new",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const mockListWorkspaces = mock(async () => [existingWorkspace]);
const mockCreateWorkspace = mock(async (values: Record<string, unknown>) => ({
  ...createdWorkspace,
  ...values,
}));

mock.module("../repositories/workspace-repository", () => ({
  createWorkspace: mockCreateWorkspace,
  findWorkspaceById: mock(async () => undefined),
  listWorkspaces: mockListWorkspaces,
}));

mock.module("../services/serializers", () => ({
  serializeWorkspace: (workspace: typeof existingWorkspace) => ({
    ...workspace,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  }),
}));

const { workspaceService } =
  (await import("../services/workspace-service")) as typeof import("../services/workspace-service");
mock.restore();

describe("workspace-service", () => {
  beforeEach(() => {
    mockListWorkspaces.mockClear();
    mockCreateWorkspace.mockClear();
  });

  test("returns existing workspaces owned by the authenticated user", async () => {
    const result = await workspaceService.list("user-existing");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(existingWorkspace.id);
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
  });

  test("creates a personal workspace when an authenticated user has none", async () => {
    const result = await workspaceService.list("user-new");

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Personal Workspace");
    expect(mockCreateWorkspace).toHaveBeenCalledTimes(1);
    expect(mockCreateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
        metadata: {},
        name: "Personal Workspace",
        ownerId: "user-new",
      }),
    );
    expect(String(mockCreateWorkspace.mock.calls[0]?.[0]?.slug)).toMatch(/^personal-[0-9a-f]{12}$/);
  });
});
