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

// ── Provider Logos (inline SVG) ──────────────────────────────────────────────

function AnthropicLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 46 32" fill="currentColor" className={className}>
      <path d="M32.73 0H26.l-13.27 32h6.73L32.73 0ZM13.27 0 0 32h6.9l2.72-6.73h13.18l2.72 6.73h6.9L19.15 0h-5.88Zm-.36 19.54 4.36-10.76 4.36 10.76H12.91Z" />
    </svg>
  );
}

function OpenAILogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

// ── Model Data ───────────────────────────────────────────────────────────────

interface ModelEntry {
  id: string;
  providerId: string;
  providerLabel: string;
  label: string;
  description: string;
  context: string;
  speed: 'Fast' | 'Moderate';
  Logo: React.FC<{ className?: string }>;
}

const MODELS: ModelEntry[] = [
  {
    id: 'claude-opus-4-20250514',
    providerId: 'claude',
    providerLabel: 'Anthropic',
    label: 'Claude Opus 4',
    description: 'Most capable model for complex reasoning',
    context: '1M',
    speed: 'Moderate',
    Logo: AnthropicLogo,
  },
  {
    id: 'claude-sonnet-4-20250514',
    providerId: 'claude',
    providerLabel: 'Anthropic',
    label: 'Claude Sonnet 4',
    description: 'Fast and efficient for everyday tasks',
    context: '200K',
    speed: 'Fast',
    Logo: AnthropicLogo,
  },
  {
    id: 'codex',
    providerId: 'codex',
    providerLabel: 'OpenAI',
    label: 'Codex',
    description: 'OpenAI coding agent',
    context: '192K',
    speed: 'Fast',
    Logo: OpenAILogo,
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

// ── Model Picker ─────────────────────────────────────────────────────────────

function SpeedBadge({ speed }: { speed: 'Fast' | 'Moderate' }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
      speed === 'Fast'
        ? 'bg-status-success/15 text-status-success'
        : 'bg-status-info/15 text-status-info'
    }`}>
      {speed}
    </span>
  );
}

function ModelPicker({
  selectedModel,
  onSelect,
}: {
  selectedModel: string;
  onSelect: (model: ModelEntry) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? MODELS.filter(
        (m) =>
          m.label.toLowerCase().includes(search.toLowerCase()) ||
          m.providerLabel.toLowerCase().includes(search.toLowerCase()) ||
          m.description.toLowerCase().includes(search.toLowerCase())
      )
    : MODELS;

  return (
    <div className="flex flex-col w-[340px]">
      {/* Search bar */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
          <Search className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
            autoFocus
          />
        </div>
      </div>

      {/* Model list */}
      <div className="px-1.5 pb-1.5 max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No models found
          </div>
        )}
        {filtered.map((model) => {
          const isSelected = model.id === selectedModel;
          const Logo = model.Logo;

          return (
            <button
              key={model.id}
              onClick={() => onSelect(model)}
              className={`group flex items-start gap-3 w-full px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                isSelected
                  ? 'bg-accent'
                  : 'hover:bg-muted/50'
              }`}
            >
              {/* Provider logo */}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                model.providerId === 'claude'
                  ? 'bg-[#D97757]/12 text-[#D97757]'
                  : 'bg-foreground/8 text-foreground/70'
              }`}>
                <Logo className="w-3.5 h-3.5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {model.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    {model.context}
                  </span>
                  <SpeedBadge speed={model.speed} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {model.description}
                </p>
              </div>

              {/* Check */}
              {isSelected && (
                <Check className="w-4 h-4 text-primary shrink-0 mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FileTypeIcon({ type }: { type: AttachedFile['type'] }) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
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
  const [selectedModelId, setSelectedModelId] = useState('claude-opus-4-20250514');
  const [branch, setBranch] = useState('main');
  const [branchInput, setBranchInput] = useState('main');
  const [modelOpen, setModelOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0]!;

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

  const handleModelPick = (model: ModelEntry) => {
    setSelectedModelId(model.id);
    setModelOpen(false);
    onConfigChange?.({
      agentProvider: model.providerId,
      agentModel: model.id,
      branch,
    });
  };

  const handleBranchSelect = (b: string) => {
    setBranch(b);
    setBranchInput(b);
    setBranchOpen(false);
    onConfigChange?.({
      agentProvider: selectedModel.providerId,
      agentModel: selectedModel.id,
      branch: b,
    });
  };

  const hasContent = value.trim().length > 0 || files.length > 0;

  // Trigger label: "Claude Opus 4" or "Codex"
  const triggerLabel = selectedModel.label;
  const TriggerLogo = selectedModel.Logo;

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
          <div className="flex items-center gap-1">
            {/* Model selector */}
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <TriggerLogo className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{triggerLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto p-0 overflow-hidden"
                sideOffset={8}
              >
                <ModelPicker
                  selectedModel={selectedModelId}
                  onSelect={handleModelPick}
                />
              </PopoverContent>
            </Popover>

            {/* Branch selector */}
            <Popover open={branchOpen} onOpenChange={setBranchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-foreground gap-1.5"
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
                    title="Attach"
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
