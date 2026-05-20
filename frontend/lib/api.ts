const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface Game {
  id: string;
  title: string | null;
  description: string | null;
  status: 'generating' | 'draft' | 'published' | 'failed' | 'hidden';
  version: number;
  asset_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
  prompts?: Prompt[];
}

export interface Prompt {
  id: string;
  game_id: string;
  content: string;
  version: number;
  created_at: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json as T;
}

export const api = {
  listGames: () => req<Game[]>('/api/games'),

  getGame: (id: string) => req<Game>(`/api/games/${id}`),

  createGame: (prompt: string) =>
    req<{ id: string; status: string }>('/api/games', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  refineGame: (id: string, prompt: string) =>
    req<{ id: string; status: string; version: number }>(`/api/games/${id}/prompts`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  publishGame: (id: string) =>
    req<{ id: string; status: string }>(`/api/games/${id}/publish`, { method: 'POST' }),

  reportGame: (id: string) =>
    req<{ reported: boolean }>(`/api/games/${id}/report`, { method: 'POST' }),

  cancelGame: (id: string) =>
    req<{ id: string; status: string }>(`/api/games/${id}/cancel`, { method: 'POST' }),

  analyzeImage: (image: string, mediaType: string) =>
    req<{ prompt: string }>('/api/games/vision', {
      method: 'POST',
      body: JSON.stringify({ image, mediaType }),
    }),
};
