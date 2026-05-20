'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PromptForm from '@/components/PromptForm';
import { api } from '@/lib/api';

const TIPS = [
  { emoji: '🦸', text: 'Describe the main character and what they do' },
  { emoji: '🏆', text: 'Mention the goal — collect, avoid, survive, reach?' },
  { emoji: '🌍', text: 'Add a setting — forest, space, ocean, candy land…' },
  { emoji: '🎯', text: 'Keep it simple — one mechanic works best' },
];

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function CreatePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [prefillPrompt, setPrefillPrompt] = useState('');
  const [promptKey, setPromptKey] = useState(0);

  async function handleCreate(prompt: string) {
    const { id } = await api.createGame(prompt);
    router.push(`/games/${id}`);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) return;

    // Preview
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);

      // Extract base64 (strip data:image/...;base64, prefix)
      const base64 = dataUrl.split(',')[1];
      setAnalyzing(true);
      try {
        const { prompt } = await api.analyzeImage(base64, file.type);
        setPrefillPrompt(prompt);
        setPromptKey(k => k + 1); // remount PromptForm with new value
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImagePreview(null);
    setPrefillPrompt('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-20">
      <div className="mb-8">
        <div className="inline-block bg-[#fff3e8] text-[#FF6B00] text-xs font-bold px-3 py-1 rounded-full mb-4">
          ✦ AI Game Maker
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-[#1d1d1f] mb-2">
          Create your game
        </h1>
        <p className="text-[#6e6e73] text-[15px] leading-relaxed">
          Describe your idea and the AI will build a playable game in about 30 seconds.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-black/[0.08] p-6 mb-5">
        <PromptForm
          key={promptKey}
          onSubmit={handleCreate}
          placeholder="e.g. A rocket that collects stars while avoiding space rocks…"
          buttonLabel="Build My Game ✦"
          initialValue={prefillPrompt}
        />

        {/* Image upload divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-black/[0.06]" />
          <span className="text-[#aeaeb2] text-xs font-medium">or</span>
          <div className="flex-1 h-px bg-black/[0.06]" />
        </div>

        {/* Upload button */}
        {!imagePreview ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#FF3D9A]/40 text-[#FF3D9A] text-sm font-semibold hover:border-[#FF3D9A] hover:bg-[#fff0f7] transition-colors"
          >
            Upload a drawing ✦
          </button>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border border-black/[0.08]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Uploaded drawing"
              className="w-full max-h-48 object-contain bg-[#f5f5f7]"
            />
            {analyzing && (
              <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 border-2 border-[#FF3D9A] border-t-transparent rounded-full animate-spin" />
                <p className="text-[#FF3D9A] text-sm font-semibold">Analyzing your drawing…</p>
              </div>
            )}
            <button
              onClick={clearImage}
              className="absolute top-2 right-2 bg-white rounded-full w-7 h-7 flex items-center justify-center text-[#6e6e73] hover:text-[#1d1d1f] border border-black/[0.08] text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      <div className="rounded-3xl border border-black/[0.08] bg-white p-5">
        <h3 className="font-bold text-[#1d1d1f] text-sm mb-4">Tips for great games</h3>
        <ul className="space-y-3">
          {TIPS.map(({ emoji, text }) => (
            <li key={text} className="flex items-start gap-3 text-[#6e6e73] text-sm">
              <span className="text-base leading-none mt-0.5">{emoji}</span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
