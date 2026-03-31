import React, { useRef, useState, useCallback } from 'react';
import {
  ArrowUp,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  ChevronDown,
  Square,
  Loader2,
  GitBranch,
  Bot,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AttachedFile {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'file';
  size: string;
}

interface PromptBoxProps {
  onSubmit: (prompt: string, files: AttachedFile[]) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  compact?: boolean;
}

function FileTypeIcon({ type }: { type: AttachedFile['type'] }) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

export function PromptBox({
  onSubmit,
  isStreaming = false,
  onStop,
  placeholder = "Describe what you want to build...",
  compact = false,
}: PromptBoxProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const hasContent = value.trim().length > 0 || files.length > 0;

  return (
    <div className="w-full">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-shadow focus-within:shadow-md focus-within:border-ring/30">
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
          placeholder={placeholder}
          rows={compact ? 1 : 3}
          className={`
            w-full bg-transparent text-sm text-card-foreground
            placeholder:text-muted-foreground
            resize-none outline-none
            px-4 py-3
            max-h-[40vh]
            ${compact ? 'min-h-[44px]' : 'min-h-[80px]'}
          `}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-0">
          {/* Left: selectors */}
          <div className="flex items-center gap-1.5">
            <button
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                text-muted-foreground border border-border
                hover:bg-muted/50 hover:text-foreground transition-all cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Claude Code</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
            <button
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                text-muted-foreground border border-border
                hover:bg-muted/50 hover:text-foreground transition-all cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">main</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              title="Add context"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>

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
                disabled={!hasContent}
                size="icon"
                className="h-7 w-7 rounded-full ml-1"
                title="Send (Enter)"
              >
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {!compact && (
        <p className="text-center text-xs text-muted-foreground/60 mt-2.5">
          <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">Enter</kbd>
          {' '}to send{' '}
          <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">Shift+Enter</kbd>
          {' '}for new line
        </p>
      )}
    </div>
  );
}
