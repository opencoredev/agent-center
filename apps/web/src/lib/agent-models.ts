import React from "react";

export type AgentReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink";

export interface ModelEntry {
  id: string;
  agentId: string;
  label: string;
  description: string;
  context: string;
  speed: "Fast" | "Moderate" | "Slow";
  reasoningEffortLevels?: ReadonlyArray<{
    value: AgentReasoningEffort;
    label: string;
    isDefault?: boolean;
  }>;
  supportsThinkingToggle?: boolean;
  isDefault?: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
}

export interface AgentEntry {
  id: string;
  label: string;
  logoId: "anthropic" | "openai" | "opencode" | "cursor";
  credentialPath?: string;
  disabled?: boolean;
  comingSoon?: boolean;
  disabledReason?: string;
}

export const AGENTS: AgentEntry[] = [
  {
    id: "claude",
    label: "Claude Code",
    logoId: "anthropic",
    credentialPath: "/api/credentials/claude",
  },
  {
    id: "codex",
    label: "Codex",
    logoId: "openai",
    credentialPath: "/api/credentials/openai",
  },
  {
    id: "opencode",
    label: "OpenCode",
    logoId: "opencode",
    comingSoon: true,
    disabled: true,
    disabledReason: "OpenCode execution needs backend support before it can run tasks.",
  },
  {
    id: "cursor",
    label: "Cursor",
    logoId: "cursor",
    comingSoon: true,
    disabled: true,
    disabledReason: "Cursor execution needs backend support before it can run tasks.",
  },
];

export const DEFAULT_MODEL_BY_AGENT: Record<string, string> = {
  claude: "claude-opus-4-6",
  codex: "gpt-5.4",
};

export const DEFAULT_REASONING_EFFORT_BY_AGENT: Partial<
  Record<AgentEntry["id"], AgentReasoningEffort>
> = {
  claude: "high",
  codex: "high",
};

export const MODELS: ModelEntry[] = [
  {
    id: "claude-opus-4-6",
    agentId: "claude",
    label: "Claude Opus 4.6",
    description: "Most capable model for complex reasoning",
    context: "1M",
    speed: "Moderate",
    reasoningEffortLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High", isDefault: true },
      { value: "max", label: "Max" },
      { value: "ultrathink", label: "Ultrathink" },
    ],
    isDefault: true,
  },
  {
    id: "claude-sonnet-4-6",
    agentId: "claude",
    label: "Claude Sonnet 4.6",
    description: "Balanced speed and intelligence",
    context: "200K",
    speed: "Fast",
    reasoningEffortLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High", isDefault: true },
      { value: "ultrathink", label: "Ultrathink" },
    ],
  },
  {
    id: "claude-opus-4-5",
    agentId: "claude",
    label: "Claude Opus 4.5",
    description: "Previous-gen flagship reasoning",
    context: "200K",
    speed: "Moderate",
    reasoningEffortLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High", isDefault: true },
      { value: "max", label: "Max" },
    ],
  },
  {
    id: "claude-haiku-4-5",
    agentId: "claude",
    label: "Claude Haiku 4.5",
    description: "Fastest Claude for simple tasks",
    context: "200K",
    speed: "Fast",
    supportsThinkingToggle: true,
  },
  {
    id: "gpt-5.4",
    agentId: "codex",
    label: "GPT-5.4",
    description: "Latest frontier model",
    context: "1M",
    speed: "Moderate",
    reasoningEffortLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High", isDefault: true },
      { value: "xhigh", label: "Extra High" },
    ],
    isDefault: true,
  },
  {
    id: "gpt-5.4-mini",
    agentId: "codex",
    label: "GPT-5.4 Mini",
    description: "Compact and cost-efficient",
    context: "128K",
    speed: "Fast",
    reasoningEffortLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium", isDefault: true },
      { value: "high", label: "High" },
    ],
  },
  {
    id: "gpt-5.3-codex",
    agentId: "codex",
    label: "GPT-5.3 Codex",
    description: "Optimized for code generation",
    context: "192K",
    speed: "Fast",
    reasoningEffortLevels: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium", isDefault: true },
      { value: "high", label: "High" },
    ],
  },
  {
    id: "o3",
    agentId: "codex",
    label: "o3",
    description: "Advanced reasoning model",
    context: "200K",
    speed: "Slow",
    reasoningEffortLevels: [
      { value: "medium", label: "Medium" },
      { value: "high", label: "High", isDefault: true },
      { value: "xhigh", label: "Extra High" },
    ],
  },
  {
    id: "opencode-sonnet",
    agentId: "opencode",
    label: "OpenCode Sonnet",
    description: "OpenCode runtime with Anthropic-compatible credentials",
    context: "200K",
    speed: "Fast",
    disabled: true,
    comingSoon: true,
  },
  {
    id: "cursor-agent",
    agentId: "cursor",
    label: "Cursor Agent",
    description: "Cursor-style agent workflow",
    context: "200K",
    speed: "Fast",
    disabled: true,
    comingSoon: true,
  },
];

interface ProviderLogoProps {
  agent?: Pick<AgentEntry, "logoId">;
  logoId?: AgentEntry["logoId"];
  title?: string;
  className?: string;
}

function svgA11y(title?: string) {
  return title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
}

export function ProviderLogo({ agent, logoId, title, className }: ProviderLogoProps) {
  const resolvedLogoId = logoId ?? agent?.logoId ?? "openai";
  const a11yProps = svgA11y(title);

  if (resolvedLogoId === "anthropic") {
    return React.createElement(
      "svg",
      {
        ...a11yProps,
        viewBox: "0 0 24 24",
        className,
        fill: "currentColor",
      },
      React.createElement("path", {
        d: "M12 2 2.5 21h4.15l1.95-4.15h6.78L17.33 21h4.17L12 2Zm-1.9 11.55L12 9.43l1.9 4.12h-3.8Z",
      }),
    );
  }

  if (resolvedLogoId === "openai") {
    return React.createElement(
      "svg",
      {
        ...a11yProps,
        viewBox: "0 0 24 24",
        className,
        fill: "none",
      },
      React.createElement("path", {
        d: "M12 2.8a5.1 5.1 0 0 1 4.55 2.78 5.1 5.1 0 0 1 4.16 7.55 5.1 5.1 0 0 1-5.6 7.72 5.1 5.1 0 0 1-8.62-1.85 5.1 5.1 0 0 1-3.2-8.58A5.1 5.1 0 0 1 8.86 3.1 5.12 5.12 0 0 1 12 2.8Z",
        stroke: "currentColor",
        strokeWidth: "1.65",
        strokeLinejoin: "round",
      }),
      React.createElement("path", {
        d: "M8.85 3.12 15 6.66v6.88l-6.15 3.55M3.3 10.42 9.44 6.9l5.96 3.44.02 7.1M6.5 19l-.02-7.1 5.97-3.45 6.15 3.55",
        stroke: "currentColor",
        strokeWidth: "1.25",
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );
  }

  if (resolvedLogoId === "cursor") {
    return React.createElement(
      "svg",
      {
        ...a11yProps,
        viewBox: "0 0 24 24",
        className,
        fill: "currentColor",
      },
      React.createElement("path", { d: "m4 3 16 7.2-6.85 1.6L10.6 20 4 3Z" }),
    );
  }

  return React.createElement(
    "svg",
    {
      ...a11yProps,
      viewBox: "0 0 24 24",
      className,
      fill: "none",
    },
    React.createElement("path", {
      d: "M6 5h12v14H6V5Zm3.5 4h5M9.5 12h3M9.5 15h6",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}
