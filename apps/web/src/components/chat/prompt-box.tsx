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
  Bot,
  Check,
  Type,
  Link,
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

interface AttachedFile {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'file';
  size: string;
}

interface ModelOption {
  provider: string;
  model: string;
  label: string;
}

const MODEL_GROUPS: { group: string; items: ModelOption[] }[] = [
  {
    group: 'No Agent',
    items: [{ provider: 'none', model: 'manual', label: 'Manual' }],
  },
  {
    group: 'Claude Code',
    items: [
      {
        provider: 'claude',
        model: 'claude-opus-4-20250514',
        label: 'Opus',
      },
      {
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        label: 'Sonnet',
      },
    ],
  },
  {
    group: 'Codex',
    items: [{ provider: 'codex', model: 'codex', label: 'Codex' }],
  },
];

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

function FileTypeIcon({ type }: { type: AttachedFile['type'] }) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

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
  const [selectedModel, setSelectedModel] = useState<ModelOption>({
    provider: 'claude',
    model: 'claude-opus-4-20250514',
    label: 'Claude Code \u00b7 Opus',
  });
  const [branch, setBranch] = useState('main');
  const [branchInput, setBranchInput] = useState('main');
  const [modelOpen, setModelOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync defaultValue prop
  useEffect(() => {
    if (defaultValue !== undefined) {
      setValue(defaultValue);
      textareaRef.current?.focus();
    }
  }, [defaultValue]);

  // Auto-resize textarea
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

  const handleModelSelect = (item: ModelOption) => {
    const label =
      item.provider === 'none'
        ? 'Manual'
        : item.provider === 'codex'
          ? 'Codex'
          : `Claude Code \u00b7 ${item.label}`;
    const next = { ...item, label };
    setSelectedModel(next);
    setModelOpen(false);
    onConfigChange?.({
      agentProvider: item.provider,
      agentModel: item.model,
      branch,
    });
  };

  const handleBranchSelect = (b: string) => {
    setBranch(b);
    setBranchInput(b);
    setBranchOpen(false);
    onConfigChange?.({
      agentProvider: selectedModel.provider,
      agentModel: selectedModel.model,
      branch: b,
    });
  };

  const hasContent = value.trim().length > 0 || files.length > 0;

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
            {/* Model selector */}
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {selectedModel.label}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-56 p-1"
                sideOffset={8}
              >
                {MODEL_GROUPS.map((group) => (
                  <div key={group.group}>
                    <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      {group.group}
                    </div>
                    {group.items.map((item) => {
                      const isSelected =
                        item.provider === selectedModel.provider &&
                        item.model === selectedModel.model;
                      return (
                        <button
                          key={`${item.provider}-${item.model}`}
                          onClick={() => handleModelSelect(item)}
                          className="flex items-center justify-between w-full px-2.5 py-1.5 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer"
                        >
                          <span>{item.label}</span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
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

            {/* Add Context (+) */}
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
