import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  CornerDownLeft,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Square,
  Loader2,
  GitBranch,
  Check,
  Type,
  Link,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ── Provider / Model Data ────────────────────────────────────────────────────

interface ModelDef {
  id: string;
  label: string;
  context: string;
  speed: string;
}

interface ProviderDef {
  id: string;
  label: string;
  icon: string;
  iconBg: string;
  dotColor: string;
  models: ModelDef[];
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    icon: 'A\\',
    iconBg: 'bg-[#D97757]/15 text-[#D97757]',
    dotColor: 'bg-[#D97757]',
    models: [
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', context: '1M', speed: 'Moderate' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', context: '200K', speed: 'Fast' },
    ],
  },
  {
    id: 'codex',
    label: 'Codex',
    icon: 'CX',
    iconBg: 'bg-status-success/15 text-status-success',
    dotColor: 'bg-status-success',
    models: [
      { id: 'codex', label: 'Codex', context: '192K', speed: 'Fast' },
    ],
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface AttachedFile {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'file';
  size: string;
}

interface PromptBoxProps {
  onSubmit: (prompt: string, files: AttachedFile[]) => void;
  isStreaming?: boolean;
  isSubmitting?: boolean;
  onStop?: () => void;
  onConfigChange?: (config: {
    agentProvider: string;
    agentModel: string;
    branch: string;
  }) => void;
  placeholder?: string;
  compact?: boolean;
  defaultValue?: string;
}

// ── Model Picker (two-panel) ─────────────────────────────────────────────────

function ModelPicker({
  selectedProvider,
  selectedModel,
  onSelect,
}: {
  selectedProvider: string;
  selectedModel: string;
  onSelect: (providerId: string, modelId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  const filteredProviders = search
    ? PROVIDERS.filter(
        (p) =>
          p.label.toLowerCase().includes(search.toLowerCase()) ||
          p.models.some((m) => m.label.toLowerCase().includes(search.toLowerCase()))
      )
    : PROVIDERS;

  const hoveredProvider = activeProvider
    ? PROVIDERS.find((p) => p.id === activeProvider)
    : null;

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-background">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
      </div>

      <div className="flex min-h-[200px]">
        {/* Left: Providers */}
        <div className="w-[200px] border-r border-border px-1 py-0.5">
          {filteredProviders.map((provider) => {
            const isSelected = provider.id === selectedProvider;
            const isHovered = provider.id === activeProvider;

            return (
              <button
                key={provider.id}
                onMouseEnter={() => setActiveProvider(provider.id)}
                onClick={() => {
                  if (provider.models.length === 1) {
                    onSelect(provider.id, provider.models[0]!.id);
                  } else {
                    setActiveProvider(provider.id);
                  }
                }}
                className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                  isHovered || isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                {isSelected && !isHovered ? (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${provider.iconBg}`}>
                    {provider.icon}
                  </span>
                )}
                <span className="flex-1 text-left font-medium">{provider.label}</span>
                {provider.models.length > 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Models for hovered provider */}
        {hoveredProvider && hoveredProvider.models.length > 1 && (
          <div className="w-[220px] px-1 py-0.5">
            {hoveredProvider.models.map((model) => {
              const isSelected =
                hoveredProvider.id === selectedProvider && model.id === selectedModel;

              return (
                <button
                  key={model.id}
                  onClick={() => onSelect(hoveredProvider.id, model.id)}
                  className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/50'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${hoveredProvider.iconBg}`}>
                    {hoveredProvider.icon}
                  </span>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium">{model.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {model.context} ctx · {model.speed}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FileTypeIcon({ type }: { type: AttachedFile['type'] }) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

function ProviderDot({ providerId }: { providerId: string }) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  const color = provider?.dotColor ?? 'bg-muted-foreground/50';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function getDisplayLabel(providerId: string, modelId: string): string {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return 'Manual';
  const model = provider.models.find((m) => m.id === modelId);
  if (!model) return provider.label;
  if (provider.models.length === 1) return provider.label;
  return `${provider.label}: ${model.label.replace('Claude ', '')}`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PromptBox({
  onSubmit,
  isStreaming = false,
  isSubmitting = false,
  onStop,
  onConfigChange,
  placeholder,
  compact = false,
  defaultValue,
}: PromptBoxProps) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('claude');
  const [selectedModel, setSelectedModel] = useState('claude-opus-4-20250514');
  const [branch, setBranch] = useState('main');
  const [branchInput, setBranchInput] = useState('main');
  const [modelOpen, setModelOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultValue !== undefined) {
      setValue(defaultValue);
      textareaRef.current?.focus();
    }
  }, [defaultValue]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && files.length === 0) return;
    onSubmit(trimmed, files);
    setValue('');
    setFiles([]);
  }, [value, files, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      type: (f.type.startsWith('image/')
        ? 'image'
        : f.name.endsWith('.pdf')
          ? 'pdf'
          : 'file') as AttachedFile['type'],
      size: f.size < 1024 ? `${f.size}B` : `${Math.round(f.size / 1024)}KB`,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleModelPick = (providerId: string, modelId: string) => {
    setSelectedProvider(providerId);
    setSelectedModel(modelId);
    setModelOpen(false);
    onConfigChange?.({
      agentProvider: providerId,
      agentModel: modelId,
      branch,
    });
  };

  const handleBranchSelect = (b: string) => {
    setBranch(b);
    setBranchInput(b);
    setBranchOpen(false);
    onConfigChange?.({
      agentProvider: selectedProvider,
      agentModel: selectedModel,
      branch: b,
    });
  };

  const hasContent = value.trim().length > 0 || files.length > 0;
  const displayLabel = getDisplayLabel(selectedProvider, selectedModel);

  const resolvedPlaceholder =
    placeholder ||
    (compact
      ? 'Send a message...'
      : 'Describe what you want to build...\nEnter to send \u00b7 Shift+Enter for new line');

  return (
    <div className="w-full">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-ring/50">
        {/* Attached files */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-muted text-xs text-foreground"
              >
                <FileTypeIcon type={file.type} />
                <span className="max-w-[140px] truncate">{file.name}</span>
                <span className="text-muted-foreground">{file.size}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          className={`
            w-full bg-transparent text-sm text-card-foreground
            placeholder:text-muted-foreground
            resize-none outline-none
            px-4 py-3
            max-h-[40vh]
            ${compact ? 'min-h-[44px]' : 'min-h-[100px]'}
          `}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-0">
          {/* Left: selectors */}
          <div className="flex items-center gap-1.5">
            {/* Model selector — two-panel */}
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <ProviderDot providerId={selectedProvider} />
                  <span className="hidden sm:inline">{displayLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto p-1.5"
                sideOffset={8}
              >
                <ModelPicker
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onSelect={handleModelPick}
                />
              </PopoverContent>
            </Popover>

            {/* Branch selector */}
            <Popover open={branchOpen} onOpenChange={setBranchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{branch}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-56 p-2"
                sideOffset={8}
              >
                <div className="space-y-2">
                  <input
                    type="text"
                    value={branchInput}
                    onChange={(e) => setBranchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBranchSelect(branchInput.trim() || 'main');
                      }
                    }}
                    placeholder="Branch name..."
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={() => handleBranchSelect('main')}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer"
                  >
                    <span>main</span>
                    {branch === 'main' && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <TooltipProvider delayDuration={200}>
              <Popover open={contextOpen} onOpenChange={setContextOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    title="Add context"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-48 p-1"
                  sideOffset={8}
                >
                  <button
                    onClick={() => {
                      setContextOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex items-center gap-2.5 w-full px-2.5 py-1.5 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Upload files</span>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        disabled
                        className="flex items-center gap-2.5 w-full px-2.5 py-1.5 text-sm rounded-md text-muted-foreground cursor-not-allowed"
                      >
                        <Type className="w-3.5 h-3.5" />
                        <span>Paste text</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs">Coming soon</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        disabled
                        className="flex items-center gap-2.5 w-full px-2.5 py-1.5 text-sm rounded-md text-muted-foreground cursor-not-allowed"
                      >
                        <Link className="w-3.5 h-3.5" />
                        <span>URL</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs">Coming soon</p>
                    </TooltipContent>
                  </Tooltip>
                </PopoverContent>
              </Popover>
            </TooltipProvider>

            {isStreaming ? (
              <Button
                onClick={onStop}
                size="icon"
                variant="destructive"
                className="h-7 w-7 rounded-full ml-1"
                title="Stop"
              >
                <Square className="w-3 h-3" fill="currentColor" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!hasContent || isSubmitting}
                size="icon"
                className="h-7 w-7 rounded-full ml-1"
                title="Send (Enter)"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CornerDownLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
