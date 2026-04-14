const SELF_HOSTED_CONNECTOR_KEY = 'agent_center_self_hosted_connector';

export interface SelfHostedConnectorConfig {
  label: string;
  baseUrl: string;
}

export function getSelfHostedConnectorConfig(): SelfHostedConnectorConfig | null {
  try {
    const raw = localStorage.getItem(SELF_HOSTED_CONNECTOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SelfHostedConnectorConfig>;
    if (!parsed.label || !parsed.baseUrl) return null;
    return {
      label: parsed.label,
      baseUrl: parsed.baseUrl,
    };
  } catch {
    return null;
  }
}

export function saveSelfHostedConnectorConfig(config: SelfHostedConnectorConfig) {
  localStorage.setItem(SELF_HOSTED_CONNECTOR_KEY, JSON.stringify(config));
}

export function clearSelfHostedConnectorConfig() {
  localStorage.removeItem(SELF_HOSTED_CONNECTOR_KEY);
}
