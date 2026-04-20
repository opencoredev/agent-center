import {
  GitHubAppApiError,
  GitHubAppClient,
  GitHubAppConfigurationError,
  buildGitHubAppInstallUrl,
} from "@agent-center/github";

import { apiEnv } from "../env";
import { ApiError } from "../http/errors";

const REQUIRED_GITHUB_APP_FIELDS = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY"] as const;

function getMissingFields() {
  return REQUIRED_GITHUB_APP_FIELDS.filter((field) => {
    const value = apiEnv[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

function getInstallUrl() {
  if (!apiEnv.GITHUB_APP_SLUG) {
    return null;
  }

  return buildGitHubAppInstallUrl({
    slug: apiEnv.GITHUB_APP_SLUG,
  });
}

function buildBaseStatus() {
  return {
    appId: apiEnv.GITHUB_APP_ID ?? null,
    callbackUrl: apiEnv.GITHUB_APP_CALLBACK_URL ?? null,
    clientId: apiEnv.GITHUB_APP_CLIENT_ID ?? null,
    configured: getMissingFields().length === 0,
    installUrl: getInstallUrl(),
    setupUrl: apiEnv.GITHUB_APP_SETUP_URL ?? null,
    slug: apiEnv.GITHUB_APP_SLUG ?? null,
  };
}

function createGitHubAppClient() {
  const missingFields = getMissingFields();

  if (missingFields.length > 0) {
    throw new ApiError(501, "github_app_not_configured", "GitHub App is not configured", {
      missingFields,
    });
  }

  return new GitHubAppClient({
    appId: apiEnv.GITHUB_APP_ID!,
    slug: apiEnv.GITHUB_APP_SLUG!,
    privateKey: apiEnv.GITHUB_APP_PRIVATE_KEY!,
  });
}

export const githubAppService = {
  async getStatus() {
    const missingFields = getMissingFields();

    if (missingFields.length > 0) {
      return {
        ...buildBaseStatus(),
        healthy: false,
        missingFields,
        app: null,
        error: null,
      };
    }

    try {
      const client = createGitHubAppClient();

      return {
        ...buildBaseStatus(),
        healthy: true,
        missingFields,
        app: await client.getApp(),
        error: null,
      };
    } catch (error) {
      if (error instanceof GitHubAppConfigurationError || error instanceof GitHubAppApiError) {
        return {
          ...buildBaseStatus(),
          healthy: false,
          missingFields,
          app: null,
          error: error.message,
        };
      }

      throw error;
    }
  },

  async listInstallations() {
    return createGitHubAppClient().listInstallations();
  },

  async listInstallationRepositories(installationId: number) {
    return createGitHubAppClient().listInstallationRepositories(installationId);
  },

  async getInstallationAccessToken(installationId: number) {
    return createGitHubAppClient().createInstallationAccessToken(installationId);
  },
};
