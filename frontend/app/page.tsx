'use client';

import { useRouter } from 'next/navigation';
import PromptForm from '@/components/PromptForm';
import { api } from '@/lib/api';

const EXAMPLE_PROMPTS = [
  { emoji: '🐱', text: 'A cat collecting fish while avoiding dogs' },
  { emoji: '🚀', text: 'Space explorer dodging asteroids' },
  { emoji: '🐸', text: 'Frog jumping across lily pads' },
  { emoji: '⭐', text: 'Catch falling stars in a bucket' },
  { emoji: '🍄', text: 'Mushroom platformer through a forest' },
];

export default function HomePage() {
  const router = useRouter();

  async function handleCreate(prompt: string) {
    const { id } = await api.createGame(prompt);
    router.push(`/games/${id}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-6">
      {/* Hero */}
      <div className="text-center pt-20 pb-12">
        <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight text-[#1d1d1f] leading-[1.05] mb-5">
          Dream it.<br />
          <span className="text-[#FF6B00]">Play it.</span>
        </h1>
        <p className="text-[#6e6e73] text-xl max-w-md mx-auto leading-relaxed mb-10">
          Type any game idea. Play it.
        </p>

        {/* Create form */}
        <div className="max-w-lg mx-auto mb-6">
          <PromptForm
            onSubmit={handleCreate}
            placeholder="e.g. A bunny collecting carrots while avoiding foxes…"
            buttonLabel="Make My Game ✦"
          />
        </div>

        {/* Example prompts */}
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_PROMPTS.map(({ emoji, text }) => (
            <button
              key={text}
              onClick={() => handleCreate(text)}
              className="flex items-center gap-1.5 text-sm font-medium text-[#3d3d3f] bg-white border border-black/[0.08] hover:border-[#FF6B00]/40 hover:bg-[#fff3e8] px-3.5 py-1.5 rounded-full transition-all"
            >
              <span>{emoji}</span>
              <span>{text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pb-20" />
    </div>
  );
}
