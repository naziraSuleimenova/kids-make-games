import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase';
import { runGameGeneration } from '../services/gameWorker';
import { moderatePrompt } from '../services/moderation';
import { analyzeImageForGame } from '../services/claude';
import { gameCreationLimiter } from '../middleware/rateLimit';
import { MESSAGES } from '../constants/messages';

const router = Router();

const PromptSchema = z.object({
  prompt: z
    .string()
    .min(10, MESSAGES.PROMPT_TOO_SHORT)
    .max(240, MESSAGES.PROMPT_TOO_LONG)
    .trim(),
});

function fail(res: Response, route: string, err: unknown): void {
  console.error(`[${route}]`, err);
  res.status(500).json({ error: MESSAGES.SERVER_ERROR });
}

// GET /api/games — list published games (gallery)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('id, title, description, status, thumbnail_url, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    fail(res, 'GET /api/games', err);
  }
});

// POST /api/games/vision — analyze image and return a game prompt (Claude Vision)
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type AllowedMediaType = typeof ALLOWED_MEDIA_TYPES[number];

const VisionSchema = z.object({
  image: z.string().min(100, 'Image data too small'),
  mediaType: z.enum(ALLOWED_MEDIA_TYPES),
});

router.post('/vision', async (req: Request, res: Response) => {
  const parsed = VisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  try {
    const prompt = await analyzeImageForGame(
      parsed.data.image,
      parsed.data.mediaType as AllowedMediaType,
    );
    res.json({ prompt });
  } catch (err) {
    fail(res, 'POST /api/games/vision', err);
  }
});

// GET /api/games/:id — get game + prompt history
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !game) {
      res.status(404).json({ error: MESSAGES.GAME_NOT_FOUND });
      return;
    }

    const { data: prompts } = await supabase
      .from('prompts')
      .select('*')
      .eq('game_id', req.params.id)
      .order('version', { ascending: true });

    res.json({ ...game, prompts: prompts ?? [] });
  } catch (err) {
    fail(res, `GET /api/games/${req.params.id}`, err);
  }
});

// POST /api/games — create game from first prompt
router.post('/', gameCreationLimiter, async (req: Request, res: Response) => {
  const parsed = PromptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  try {
    console.log(`[POST /api/games] prompt: "${parsed.data.prompt}"`);

    const moderation = await moderatePrompt(parsed.data.prompt);
    console.log(`[POST /api/games] moderation:`, moderation);

    if (!moderation.allowed) {
      res.status(400).json({ error: MESSAGES.CONTENT_REJECTED });
      return;
    }

    const finalPrompt = moderation.was_sanitized ? moderation.sanitized_prompt : parsed.data.prompt;
    const gameId = uuidv4();
    const now = new Date().toISOString();

    // Derive a rough title from the prompt immediately so the generating screen
    // shows something meaningful from second one. generateMeta will overwrite this.
    const draftTitle = (() => {
      const words = finalPrompt.trim().split(/\s+/).slice(0, 5).join(' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    })();

    const { error: gameError } = await supabase.from('games').insert({
      id: gameId,
      title: draftTitle,
      status: 'generating',
      version: 1,
      report_count: 0,
      created_at: now,
      updated_at: now,
    });
    if (gameError) throw gameError;

    const { error: promptError } = await supabase.from('prompts').insert({
      id: uuidv4(),
      game_id: gameId,
      content: finalPrompt,
      version: 1,
      created_at: now,
    });
    if (promptError) throw promptError;

    console.log(`[POST /api/games] game ${gameId} created — starting generation`);
    runGameGeneration(gameId, 1);

    res.status(202).json({ id: gameId, status: 'generating' });
  } catch (err) {
    fail(res, 'POST /api/games', err);
  }
});

// POST /api/games/:id/prompts — refine an existing game
router.post('/:id/prompts', async (req: Request, res: Response) => {
  const parsed = PromptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !game) {
      res.status(404).json({ error: MESSAGES.GAME_NOT_FOUND });
      return;
    }

    if (game.status === 'generating') {
      res.status(409).json({ error: MESSAGES.GAME_STILL_GENERATING });
      return;
    }

    const { count } = await supabase
      .from('prompts')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', req.params.id);

    if ((count ?? 0) >= 10) {
      res.status(400).json({ error: MESSAGES.MAX_PROMPTS });
      return;
    }

    const { data: allPrompts } = await supabase
      .from('prompts')
      .select('content')
      .eq('game_id', req.params.id)
      .order('version', { ascending: true });

    const history = (allPrompts ?? []).map((p: { content: string }) => p.content);
    const moderation = await moderatePrompt(parsed.data.prompt, history);

    if (!moderation.allowed) {
      res.status(400).json({ error: MESSAGES.CONTENT_REJECTED });
      return;
    }

    const finalPrompt = moderation.was_sanitized ? moderation.sanitized_prompt : parsed.data.prompt;
    const newVersion = game.version + 1;
    const now = new Date().toISOString();

    await supabase.from('prompts').insert({
      id: uuidv4(),
      game_id: req.params.id,
      content: finalPrompt,
      version: newVersion,
      created_at: now,
    });

    await supabase
      .from('games')
      .update({ status: 'generating', version: newVersion, updated_at: now })
      .eq('id', req.params.id);

    console.log(`[POST /api/games/${req.params.id}/prompts] v${newVersion} — starting generation`);
    runGameGeneration(String(req.params.id), newVersion);

    res.status(202).json({ id: req.params.id, status: 'generating', version: newVersion });
  } catch (err) {
    fail(res, `POST /api/games/${req.params.id}/prompts`, err);
  }
});

// POST /api/games/:id/cancel — cancel an in-progress generation
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (error || !game) {
      res.status(404).json({ error: MESSAGES.GAME_NOT_FOUND });
      return;
    }

    if (game.status !== 'generating') {
      res.status(400).json({ error: 'Game is not currently generating.' });
      return;
    }

    await supabase
      .from('games')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ id: req.params.id, status: 'failed' });
  } catch (err) {
    fail(res, `POST /api/games/${req.params.id}/cancel`, err);
  }
});

// POST /api/games/:id/publish
router.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (error || !game) {
      res.status(404).json({ error: MESSAGES.GAME_NOT_FOUND });
      return;
    }

    if (game.status !== 'draft') {
      res.status(400).json({ error: MESSAGES.NOT_A_DRAFT });
      return;
    }

    await supabase
      .from('games')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ id: req.params.id, status: 'published' });
  } catch (err) {
    fail(res, `POST /api/games/${req.params.id}/publish`, err);
  }
});

// POST /api/games/:id/report — auto-hides at 3 reports
router.post('/:id/report', async (req: Request, res: Response) => {
  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('report_count')
      .eq('id', req.params.id)
      .single();

    if (error || !game) {
      res.status(404).json({ error: MESSAGES.GAME_NOT_FOUND });
      return;
    }

    const newCount = (game.report_count ?? 0) + 1;
    const update: Record<string, unknown> = {
      report_count: newCount,
      updated_at: new Date().toISOString(),
    };
    if (newCount >= 3) update.status = 'hidden';

    await supabase.from('games').update(update).eq('id', req.params.id);
    res.json({ reported: true });
  } catch (err) {
    fail(res, `POST /api/games/${req.params.id}/report`, err);
  }
});

export default router;
