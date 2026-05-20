'use client';

import { useState } from 'react';

interface Props {
  onSubmit: (prompt: string) => Promise<void>;
  placeholder?: string;
  buttonLabel?: string;
  disabled?: boolean;
  maxLength?: number;
  initialValue?: string;
}

export default function PromptForm({
  onSubmit,
  placeholder = 'A cat jumps over obstacles to collect fish...',
  buttonLabel = 'Create Game ✦',
  disabled = false,
  maxLength = 240,
  initialValue = '',
}: Props) {
  const [prompt, setPrompt] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const remaining = maxLength - prompt.length;
  const tooShort = prompt.trim().length < 10;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort || loading || disabled) return;
    setLoading(true);
    setError('');
    try {
      await onSubmit(prompt.trim());
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again!');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      <div className="relative">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          rows={3}
          disabled={loading || disabled}
          className="w-full rounded-2xl bg-white border border-black/[0.12] focus:border-[#FF3D9A] focus:ring-2 focus:ring-[#FF3D9A]/20 outline-none p-4 pr-14 text-[#1d1d1f] placeholder-[#aeaeb2] resize-none text-[15px] transition-all disabled:opacity-50"
        />
        <span
          className={`absolute bottom-3 right-4 text-xs font-medium tabular-nums ${
            remaining < 20 ? 'text-red-500' : 'text-[#aeaeb2]'
          }`}
        >
          {remaining}
        </span>
      </div>

      {error && <p className="text-red-500 text-sm px-1">{error}</p>}

      <button
        type="submit"
        disabled={tooShort || loading || disabled}
        className="w-full rounded-2xl py-3.5 px-6 font-bold text-[15px] bg-[#FF6B00] hover:bg-[#e55a00] active:scale-[0.98] transition-all text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating…
          </span>
        ) : (
          buttonLabel
        )}
      </button>
    </form>
  );
}
