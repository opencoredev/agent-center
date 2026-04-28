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
  logoId: "claude" | "codex" | "openai" | "opencode" | "cursor" | "convex";
  credentialPath?: string;
  localSetupKey?: string;
  disabled?: boolean;
  comingSoon?: boolean;
  disabledReason?: string;
}

export const AGENTS: AgentEntry[] = [
  {
    id: "claude",
    label: "Claude Code",
    logoId: "claude",
    credentialPath: "/api/credentials/claude",
  },
  {
    id: "codex",
    label: "Codex",
    logoId: "codex",
    credentialPath: "/api/credentials/openai",
  },
  {
    id: "opencode",
    label: "OpenCode",
    logoId: "opencode",
    localSetupKey: "ac_harness_setup_opencode",
    disabledReason: "Set up the OpenCode account on this device before choosing its harness.",
  },
  {
    id: "cursor",
    label: "Cursor",
    logoId: "cursor",
    localSetupKey: "ac_harness_setup_cursor",
    disabledReason: "Set up the Cursor account on this device before choosing its harness.",
  },
];

export const DEFAULT_MODEL_BY_AGENT: Record<string, string> = {
  claude: "claude-opus-4-6",
  codex: "gpt-5.4",
  opencode: "opencode-sonnet",
  cursor: "cursor-agent",
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
    description: "OpenCode harness using your local account login",
    context: "200K",
    speed: "Fast",
  },
  {
    id: "cursor-agent",
    agentId: "cursor",
    label: "Cursor Agent",
    description: "Cursor harness using your local account login",
    context: "200K",
    speed: "Fast",
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

  if (resolvedLogoId === "claude") {
    return React.createElement(
      "svg",
      {
        ...a11yProps,
        viewBox: "0 0 24 24",
        className,
        fill: "currentColor",
      },
      React.createElement("path", {
        d: "m4.714 15.956 4.718-2.648.079-.23-.08-.128h-.23l-.79-.048-2.695-.073-2.337-.097-2.265-.122-.57-.121-.535-.704.055-.353.48-.321.685.06 1.518.104 2.277.157 1.651.098 2.447.255h.389l.054-.158-.133-.097-.103-.098-2.356-1.596-2.55-1.688-1.336-.972-.722-.491L2 6.223l-.158-1.008.656-.722.88.06.224.061.893.686 1.906 1.476 2.49 1.833.364.304.146-.104.018-.072-.164-.274-1.354-2.446-1.445-2.49-.644-1.032-.17-.619a3 3 0 0 1-.103-.729L6.287.133 6.7 0l.995.134.42.364.619 1.415L9.735 4.14l1.555 3.03.455.898.243.832.09.255h.159V9.01l.127-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.583.28.48.685-.067.444-.286 1.851-.558 2.903-.365 1.942h.213l.243-.242.983-1.306 1.652-2.064.728-.82.85-.904.547-.431h1.032l.759 1.129-.34 1.166-1.063 1.347-.88 1.142-1.263 1.7-.79 1.36.074.11.188-.02 2.853-.606 1.542-.28 1.84-.315.832.388.09.395-.327.807-1.967.486-2.307.462-3.436.813-.043.03.049.061 1.548.146.662.036h1.62l3.018.225.79.522.473.638-.08.485-1.213.62-1.64-.389-3.825-.91-1.31-.329h-.183v.11l1.093 1.068 2.003 1.81 2.508 2.33.127.578-.321.455-.34-.049-2.204-1.657-.85-.747-1.925-1.62h-.127v.17l.443.649 2.343 3.521.122 1.08-.17.353-.607.213-.668-.122-1.372-1.924-1.415-2.168-1.141-1.943-.14.08-.674 7.254-.316.37-.728.28-.607-.461-.322-.747.322-1.476.388-1.924.316-1.53.285-1.9.17-.632-.012-.042-.14.018-1.432 1.967-2.18 2.945-1.724 1.845-.413.164-.716-.37.066-.662.401-.589 2.386-3.036 1.439-1.882.929-1.086-.006-.158h-.055L4.138 18.56l-1.13.146-.485-.456.06-.746.231-.243 1.907-1.312Z",
      }),
    );
  }

  if (resolvedLogoId === "codex" || resolvedLogoId === "openai") {
    return React.createElement(
      "svg",
      {
        ...a11yProps,
        viewBox: "0 0 24 24",
        className,
        fill: "currentColor",
      },
      React.createElement("path", {
        d: "M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-.141-.085-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z",
      }),
    );
  }

  if (resolvedLogoId === "opencode") {
    return React.createElement(
      "svg",
      {
        ...a11yProps,
        viewBox: "0 0 24 24",
        className,
        fill: "none",
      },
      React.createElement("rect", {
        x: "4",
        y: "4",
        width: "16",
        height: "16",
        rx: "4",
        stroke: "currentColor",
        strokeWidth: "2",
      }),
      React.createElement("path", {
        d: "m9.25 9-3 3 3 3M14.75 9l3 3-3 3",
        stroke: "currentColor",
        strokeWidth: "2",
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
      React.createElement("path", {
        d: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23",
      }),
    );
  }

  if (resolvedLogoId === "convex") {
    return React.createElement(
      "svg",
      {
        ...a11yProps,
        viewBox: "0 0 24 24",
        className,
        fill: "currentColor",
      },
      React.createElement("path", {
        d: "M15.09 18.916c3.488-.387 6.776-2.246 8.586-5.348-.857 7.673-9.247 12.522-16.095 9.545a3.47 3.47 0 0 1-1.547-1.314c-1.539-2.417-2.044-5.492-1.318-8.282 2.077 3.584 6.3 5.78 10.374 5.399m-10.501-7.65c-1.414 3.266-1.475 7.092.258 10.24-6.1-4.59-6.033-14.41-.074-18.953a3.44 3.44 0 0 1 1.893-.707c2.825-.15 5.695.942 7.708 2.977-4.09.04-8.073 2.66-9.785 6.442m11.757-5.437C14.283 2.951 11.053.992 7.515.933c6.84-3.105 15.253 1.929 16.17 9.37a3.6 3.6 0 0 1-.334 2.02c-1.278 2.594-3.647 4.607-6.416 5.352 2.029-3.763 1.778-8.36-.589-11.847",
      }),
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
    React.createElement("rect", {
      x: "4.25",
      y: "4",
      width: "15.5",
      height: "16",
      rx: "2.25",
      stroke: "currentColor",
      strokeWidth: "1.8",
    }),
    React.createElement("path", {
      d: "m8.25 9 2.6 3-2.6 3M12.75 15h3.25",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}
