import React, { useRef, useState, useCallback } from 'react';
import {
  ArrowRight,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  ChevronDown,
  Square,
  Loader2,
  GitBranch,
  Github,
  Bot,
  Settings2,
  ClipboardList,
  RotateCcw,
} from 'lucide-react';

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
  centered?: boolean;
}

function fileTypeIcon(type: AttachedFile['type']) {
  if (type === 'pdf') return <FileText className="w-3.5 h-3.5" />;
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

export function PromptBox({
  onSubmit,
  isStreaming = false,
  onStop,
  placeholder = 'Plan a new task for Agent to handle... (use \'@\' to mention apps or files)',
  centered = false,
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

  return (
    <div className={centered ? 'w-full max-w-3xl mx-auto' : 'w-full'}>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Attached files */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-0">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary text-xs text-card-foreground"
              >
                {fileTypeIcon(file.type)}
                <span className="max-w-[120px] truncate">{file.name}</span>
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
          rows={centered ? 3 : 1}
          className={`
            w-full bg-transparent text-[15px] text-card-foreground
            placeholder:text-muted-foreground
            resize-none outline-none
            px-4 py-3
            max-h-[40vh]
            ${centered ? 'min-h-[80px]' : 'min-h-[44px]'}
          `}
        />

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-0">
          {/* Left: repo, branch, agent selectors */}
          <div className="flex items-center gap-1.5">
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                text-muted-foreground bg-secondary/50 border border-border
                hover:bg-secondary hover:text-foreground transition-all cursor-pointer"
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Repository</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                text-muted-foreground bg-secondary/50 border border-border
                hover:bg-secondary hover:text-foreground transition-all cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">main</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                text-muted-foreground bg-secondary/50 border border-border
                hover:bg-secondary hover:text-foreground transition-all cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Claude Code: Opus 4.6</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
          </div>

          {/* Right: action icons + submit */}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              title="Clipboard"
            >
              <ClipboardList className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              title="Attach files"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              title="Retry"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive text-destructive-foreground hover:opacity-90 transition-colors cursor-pointer ml-1"
                title="Stop"
              >
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim() && files.length === 0}
                className="flex items-center justify-center w-8 h-8 rounded-full
                  bg-foreground text-background font-bold
                  hover:opacity-90 transition-all cursor-pointer ml-1
                  disabled:opacity-30 disabled:cursor-not-allowed"
                title="Send (Enter)"
              >
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {centered && (
        <p className="text-center text-[11px] text-muted-foreground mt-3">
          Press <kbd className="px-1 py-0.5 rounded bg-secondary text-muted-foreground font-mono text-[10px]">Enter</kbd> to send
          {' '}/{' '}
          <kbd className="px-1 py-0.5 rounded bg-secondary text-muted-foreground font-mono text-[10px]">Shift+Enter</kbd> for new line
        </p>
      )}
    </div>
  );
}
