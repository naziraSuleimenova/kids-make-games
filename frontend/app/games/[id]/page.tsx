'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import GamePlayer from '@/components/GamePlayer';
import PromptForm from '@/components/PromptForm';
import BrickStack from '@/components/BrickStack';
import { api, type Game } from '@/lib/api';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  generating: { label: '⏳ Generating…', color: 'text-amber-600' },
  draft:      { label: '📝 Draft',       color: 'text-[#6e6e73]'  },
  published:  { label: '✅ Published',   color: 'text-green-600'  },
  failed:     { label: '❌ Failed',      color: 'text-red-500'    },
};

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelledRef = useRef(false);

  const fetchGame = useCallback(async () => {
    try {
      const data = await api.getGame(id);
      if (!cancelledRef.current) setGame(data);
      return data.status;
    } catch {
      setError('Could not load this game.');
      return 'failed';
    }
  }, [id]);

  useEffect(() => {
    cancelledRef.current = false;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      if (cancelledRef.current) return;
      const status = await fetchGame();
      if (status === 'generating' && !cancelledRef.current) {
        timeout = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => clearTimeout(timeout);
  }, [fetchGame]);

  async function handleRefine(prompt: string) {
    cancelledRef.current = false;
    await api.refineGame(id, prompt);
    setGame(prev => prev ? { ...prev, status: 'generating' } : prev);
    const poll = async () => {
      if (cancelledRef.current) return;
      const status = await fetchGame();
      if (status === 'generating' && !cancelledRef.current) setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await api.publishGame(id);
      setGame(prev => prev ? { ...prev, status: 'published' } : prev);
    } finally {
      setPublishing(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    cancelledRef.current = true;
    try {
      await api.cancelGame(id);
    } catch {
      // best-effort
    } finally {
      setGame(prev => prev ? { ...prev, status: 'failed' } : prev);
      setCancelling(false);
    }
  }

  async function handleReport() {
    if (!confirm('Report this game as inappropriate?')) return;
    await api.reportGame(id);
    router.push('/games');
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-6 py-32 text-center">
        <div className="text-6xl mb-4">😢</div>
        <h2 className="text-2xl font-bold text-[#1d1d1f] mb-2">Game not found</h2>
        <p className="text-[#6e6e73] mb-8">{error}</p>
        <button
          onClick={() => router.push('/games')}
          className="text-[#FF6B00] font-semibold hover:underline text-sm"
        >
          ← Back to Gallery
        </button>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="shimmer h-8 w-56 rounded-xl mb-8" />
        <div className="shimmer rounded-3xl w-full" style={{ aspectRatio: '800/600' }} />
      </div>
    );
  }

  const isGenerating = game.status === 'generating';
  const isDraft      = game.status === 'draft';
  const isFailed     = game.status === 'failed';
  const statusInfo   = STATUS_LABELS[game.status] ?? { label: game.status, color: 'text-[#6e6e73]' };
  const promptCount  = game.prompts?.length ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1d1d1f] leading-tight">
            {game.title ?? 'Your Game'}
          </h1>
          {game.description && (
            <p className="text-[#6e6e73] text-[15px] mt-1">{game.description}</p>
          )}
          <span className={`text-sm font-semibold ${statusInfo.color} mt-1.5 block`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isDraft && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="text-sm font-bold text-white px-4 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#e55a00] transition-colors disabled:opacity-40"
            >
              {publishing ? 'Publishing…' : '🌍 Publish'}
            </button>
          )}
          <button
            onClick={handleReport}
            className="text-[#aeaeb2] hover:text-red-500 text-xs font-medium transition-colors px-2 py-1"
          >
            Report
          </button>
        </div>
      </div>

      {/* Generating */}
      {isGenerating && (
        <div className="rounded-3xl border border-black/[0.08] bg-white flex flex-col items-center justify-center gap-4 py-24 mb-8">
          <BrickStack />
          <p className="text-[#1d1d1f] font-semibold text-lg max-w-[42ch] text-center truncate px-6">
            {game.prompts?.[0]?.content ?? ''}
          </p>
          <p className="text-[#6e6e73] text-sm">Building your game…</p>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="mt-2 text-sm text-[#aeaeb2] hover:text-[#6e6e73] transition-colors disabled:opacity-40"
          >
            {cancelling ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      )}

      {/* Failed */}
      {isFailed && (
        <div className="rounded-3xl border border-orange-100 bg-orange-50 flex flex-col items-center justify-center gap-2 py-16 mb-8">
          <div className="text-4xl">😓</div>
          <p className="text-[#1d1d1f] font-bold text-lg">Generation failed</p>
          <p className="text-[#6e6e73] text-sm text-center max-w-xs">
            Try refining your prompt below with slightly different wording.
          </p>
        </div>
      )}

      {/* Game iframe */}
      {!isGenerating && game.asset_url && (
        <div className="rounded-3xl overflow-hidden border border-black/[0.08] shadow-sm mb-8">
          <GamePlayer src={game.asset_url} title={game.title ?? 'Game'} />
        </div>
      )}

      {/* Refinement */}
      {(isDraft || isFailed) && promptCount < 10 && (
        <div className="bg-white border border-black/[0.08] rounded-3xl p-6 mb-6">
          <h2 className="font-bold text-[#1d1d1f] text-[15px] mb-1">
            {isFailed ? '🔄 Try again' : '✏️ Refine your game'}
          </h2>
          <p className="text-[#6e6e73] text-sm mb-4">
            {isFailed
              ? "Describe what you want differently and we'll try again."
              : `Tell the AI what to change. Refinement ${promptCount}/10.`}
          </p>
          <PromptForm
            onSubmit={handleRefine}
            placeholder="Make the player faster and add more obstacles…"
            buttonLabel="Update Game ✦"
            disabled={isGenerating}
          />
        </div>
      )}

      {/* Prompt history */}
      {game.prompts && game.prompts.length > 0 && (
        <div className="border-t border-black/[0.06] pt-6">
          <h3 className="text-[#aeaeb2] text-xs font-bold uppercase tracking-widest mb-3">
            Prompt history
          </h3>
          <div className="space-y-2">
            {game.prompts.map(p => (
              <div
                key={p.id}
                className="flex gap-3 items-start bg-white border border-black/[0.06] rounded-2xl px-4 py-3"
              >
                <span className="text-[#aeaeb2] text-xs font-semibold tabular-nums mt-0.5">v{p.version}</span>
                <p className="text-[#1d1d1f] text-sm">{p.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
