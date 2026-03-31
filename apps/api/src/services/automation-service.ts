import type {
  AutomationConfig,
  DomainMetadata,
  ExecutionPolicy,
  PermissionMode,
  SandboxSize,
} from "@agent-center/shared";

import { ApiError, notFoundError } from "../http/errors";
import {
  createAutomation,
  findAutomationById,
  listAutomations,
  updateAutomation,
} from "../repositories/automation-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import { projectService } from "./project-service";
import { repoConnectionService } from "./repo-connection-service";
import { serializeAutomation } from "./serializers";

export const automationService = {
  async list(filters: { workspaceId?: string; projectId?: string; enabled?: boolean }) {
    const automations = await listAutomations(filters);

    return automations.map(serializeAutomation);
  },

  async create(input: {
    workspaceId: string;
    projectId: string | null;
    repoConnectionId: string | null;
    name: string;
    enabled: boolean;
    cronExpression: string;
    taskTemplateTitle: string;
    taskTemplatePrompt: string;
    sandboxSize: SandboxSize;
    permissionMode: PermissionMode;
    branchPrefix?: string | null;
    policy: ExecutionPolicy;
    config: AutomationConfig;
    metadata: DomainMetadata;
  }) {
    const workspace = await findWorkspaceById(input.workspaceId);

    if (workspace === undefined) {
      throw notFoundError("workspace", input.workspaceId);
    }

    if (input.projectId !== null) {
      await projectService.assertWithinWorkspace(input.workspaceId, input.projectId);
    }

    if (input.repoConnectionId !== null) {
      await repoConnectionService.assertWithinWorkspace(
        input.workspaceId,
        input.repoConnectionId,
        input.projectId,
      );
    }

    const automation = await createAutomation({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      repoConnectionId: input.repoConnectionId,
      name: input.name,
      enabled: input.enabled,
      cronExpression: input.cronExpression,
      taskTemplateTitle: input.taskTemplateTitle,
      taskTemplatePrompt: input.taskTemplatePrompt,
      sandboxSize: input.sandboxSize,
      permissionMode: input.permissionMode,
      branchPrefix: input.branchPrefix ?? null,
      policy: input.policy,
      config: input.config,
      metadata: input.metadata,
    });

    return serializeAutomation(automation);
  },

  async getById(automationId: string) {
    const automation = await findAutomationById(automationId);

    if (automation === undefined) {
      throw notFoundError("automation", automationId);
    }

    return serializeAutomation(automation);
  },

  async update(
    automationId: string,
    input: {
      projectId?: string | null;
      repoConnectionId?: string | null;
      name?: string;
      enabled?: boolean;
      cronExpression?: string;
      taskTemplateTitle?: string;
      taskTemplatePrompt?: string;
      sandboxSize?: SandboxSize;
      permissionMode?: PermissionMode;
      branchPrefix?: string | null;
      policy?: ExecutionPolicy;
      config?: AutomationConfig;
      metadata?: DomainMetadata;
    },
  ) {
    const currentAutomation = await findAutomationById(automationId);

    if (currentAutomation === undefined) {
      throw notFoundError("automation", automationId);
    }

    const nextProjectId =
      input.projectId === undefined ? currentAutomation.projectId : input.projectId;
    const nextRepoConnectionId =
      input.repoConnectionId === undefined
        ? currentAutomation.repoConnectionId
        : input.repoConnectionId;

    if (nextRepoConnectionId !== null && nextProjectId === null) {
      throw new ApiError(
        409,
        "automation_project_required",
        "projectId is required when repoConnectionId is set",
      );
    }

    if (nextProjectId !== null) {
      await projectService.assertWithinWorkspace(currentAutomation.workspaceId, nextProjectId);
    }

    if (nextRepoConnectionId !== null) {
      await repoConnectionService.assertWithinWorkspace(
        currentAutomation.workspaceId,
        nextRepoConnectionId,
        nextProjectId,
      );
    }

    const automation = await updateAutomation(automationId, {
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.repoConnectionId === undefined ? {} : { repoConnectionId: input.repoConnectionId }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.cronExpression === undefined ? {} : { cronExpression: input.cronExpression }),
      ...(input.taskTemplateTitle === undefined
        ? {}
        : {
            taskTemplateTitle: input.taskTemplateTitle,
          }),
      ...(input.taskTemplatePrompt === undefined
        ? {}
        : {
            taskTemplatePrompt: input.taskTemplatePrompt,
          }),
      ...(input.sandboxSize === undefined ? {} : { sandboxSize: input.sandboxSize }),
      ...(input.permissionMode === undefined ? {} : { permissionMode: input.permissionMode }),
      ...(input.branchPrefix === undefined ? {} : { branchPrefix: input.branchPrefix }),
      ...(input.policy === undefined ? {} : { policy: input.policy }),
      ...(input.config === undefined ? {} : { config: input.config }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      updatedAt: new Date(),
    });

    return serializeAutomation(automation);
  },

  async setEnabled(automationId: string, enabled: boolean) {
    const automation = await findAutomationById(automationId);

    if (automation === undefined) {
      throw notFoundError("automation", automationId);
    }

    if (automation.enabled === enabled) {
      return serializeAutomation(automation);
    }

    const updatedAutomation = await updateAutomation(automationId, {
      enabled,
      updatedAt: new Date(),
    });

    return serializeAutomation(updatedAutomation);
  },
};
