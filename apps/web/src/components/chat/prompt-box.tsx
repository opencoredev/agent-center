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
  placeholder = 'Describe what you want to build...',
  centered = false,
}: PromptBoxProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [agent, setAgent] = useState<'claude' | 'none'>('claude');
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
    <div className={centered ? 'w-full max-w-2xl mx-auto' : 'w-full'}>
      <div
        className={`
          relative rounded-2xl border border-[var(--color-border-default)]
          bg-[var(--color-surface-raised)]
          transition-all duration-300
          focus-within:border-[var(--color-border-strong)]
          ${centered ? 'prompt-glow-idle focus-within:shadow-[0_0_0_1px_var(--color-border-strong),0_0_60px_var(--color-accent-glow)]' : ''}
          ${centered ? '' : 'focus-within:shadow-[0_0_0_1px_var(--color-border-strong)]'}
        `}
      >
        {/* Attached files */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-0">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-white/[0.05] border border-[var(--color-border-subtle)] text-xs text-zinc-300"
              >
                {fileTypeIcon(file.type)}
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
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
            w-full bg-transparent text-[15px] text-zinc-100
            placeholder:text-zinc-600
            resize-none outline-none
            px-4 py-3
            max-h-[40vh]
            ${centered ? 'min-h-[80px]' : 'min-h-[44px]'}
          `}
        />

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-0">
          {/* Left: agent selector */}
          <div className="flex items-center gap-1.5">
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                text-zinc-400 bg-white/[0.03] border border-[var(--color-border-subtle)]
                hover:bg-white/[0.06] hover:text-zinc-300 transition-all cursor-pointer"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-[var(--color-accent)] opacity-80" />
              {agent === 'claude' ? 'Claude' : 'Shell'}
              <ChevronDown className="w-3 h-3 text-zinc-600" />
            </button>
          </div>

          {/* Right: attach + send */}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors cursor-pointer"
              title="Attach files"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors cursor-pointer"
                title="Stop"
              >
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim() && files.length === 0}
                className="flex items-center justify-center w-8 h-8 rounded-lg
                  bg-[var(--color-accent)] text-zinc-950 font-bold
                  hover:brightness-110 transition-all cursor-pointer
                  disabled:opacity-30 disabled:cursor-not-allowed"
                title="Send (Enter)"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {centered && (
        <p className="text-center text-[11px] text-zinc-600 mt-3">
          Press <kbd className="px-1 py-0.5 rounded bg-white/[0.05] text-zinc-500 font-mono text-[10px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-white/[0.05] text-zinc-500 font-mono text-[10px]">Shift+Enter</kbd> for new line
        </p>
      )}
    </div>
  );
}
