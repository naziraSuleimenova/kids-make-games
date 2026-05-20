export type GameStatus = 'generating' | 'draft' | 'published' | 'failed' | 'hidden';

export interface Game {
  id: string;
  title: string | null;
  description: string | null;
  status: GameStatus;
  version: number;
  asset_url: string | null;
  thumbnail_url: string | null;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export interface Prompt {
  id: string;
  game_id: string;
  content: string;
  version: number;
  created_at: string;
}

export interface GameWithPrompts extends Game {
  prompts: Prompt[];
}

export interface ModerationResult {
  allowed: boolean;
  reason: string;
  sanitized_prompt: string;
  was_sanitized: boolean;
}

