import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { traceable } from 'langsmith/traceable';
import { generateGameHtml, generateMeta } from './claude';
import { retrievePhaserDocs, formatDocsForPrompt } from './rag';
import { takeScreenshot } from './screenshot';
import { uploadHtml, uploadPng } from './r2';
import { supabase } from '../db/supabase';

// ── State ─────────────────────────────────────────────────────────────────────

const GameState = Annotation.Root({
  gameId:          Annotation<string>(),
  version:         Annotation<number>(),
  prompts:         Annotation<string[]>({ default: () => [], reducer: (_, b) => b }),
  gameTitle:       Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  ragContext:      Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  html:            Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  validationError: Annotation<string | null>({ default: () => null, reducer: (_, b) => b }),
  retries:         Annotation<number>({ default: () => 0, reducer: (_, b) => b }),
  assetUrl:        Annotation<string | null>({ default: () => null, reducer: (_, b) => b }),
  thumbnailUrl:    Annotation<string | null>({ default: () => null, reducer: (_, b) => b }),
});

type State = typeof GameState.State;

// ── Constants ─────────────────────────────────────────────────────────────────

const BANNED = ['fillStar', 'drawStar', 'fillPolygon', 'fillEllipse', 'fillArc'];
const MAX_RETRIES = 3;

// ── Nodes ─────────────────────────────────────────────────────────────────────

async function loadPrompts(state: State): Promise<Partial<State>> {
  const { data } = await supabase
    .from('prompts')
    .select('content')
    .eq('game_id', state.gameId)
    .order('version', { ascending: true });
  const prompts = (data ?? []).map((p: { content: string }) => p.content);
  console.log(`[graph:loadPrompts] game=${state.gameId} prompts=${prompts.length}`);
  return { prompts };
}

async function generateMetaNode(state: State): Promise<Partial<State>> {
  const meta = await generateMeta(state.prompts[0] ?? 'a fun game');
  await supabase
    .from('games')
    .update({ title: meta.title, description: meta.description })
    .eq('id', state.gameId);
  console.log(`[graph:generateMeta] title="${meta.title}"`);
  return { gameTitle: meta.title };
}

async function ragEnhanceNode(state: State): Promise<Partial<State>> {
  const query = state.prompts.join(' ');
  const docs = await retrievePhaserDocs(query, 5);
  const ragContext = formatDocsForPrompt(docs);
  if (ragContext) {
    console.log(`[graph:ragEnhance] retrieved ${docs.length} chunks (top similarity: ${docs[0]?.similarity.toFixed(3)})`);
  } else {
    console.log('[graph:ragEnhance] no docs retrieved, continuing without RAG');
  }
  return { ragContext };
}

async function generateGameNode(state: State): Promise<Partial<State>> {
  // On retry, append the validation error so Claude fixes the specific issue
  const prompts =
    state.retries > 0 && state.validationError
      ? [
          ...state.prompts,
          `IMPORTANT — fix this error from the previous attempt before responding: ${state.validationError}`,
        ]
      : state.prompts;

  console.log(`[graph:generateGame] attempt=${state.retries + 1}/${MAX_RETRIES} ragContext=${state.ragContext ? 'yes' : 'no'}`);
  const html = await generateGameHtml(prompts, state.ragContext, state.gameTitle);
  return { html, retries: state.retries + 1 };
}

function validateHtmlNode(state: State): Partial<State> {
  const banned = BANNED.filter(m => state.html.includes(`${m}(`));
  if (banned.length > 0) {
    const err = `These Phaser 3 methods do NOT exist and will crash the game: ${banned.join(', ')}. Use fillCircle, fillRect, or fillPoints instead.`;
    console.warn(`[graph:validateHtml] FAIL — ${err}`);
    return { validationError: err };
  }

  const missingScenes = ['MenuScene', 'GameScene', 'EndScene'].filter(
    s => !state.html.includes(s),
  );
  if (missingScenes.length > 0) {
    const err = `Missing required scene(s): ${missingScenes.join(', ')}. All three scenes must be present.`;
    console.warn(`[graph:validateHtml] FAIL — ${err}`);
    return { validationError: err };
  }

  console.log('[graph:validateHtml] PASS');
  return { validationError: null };
}

async function uploadAssetsNode(state: State): Promise<Partial<State>> {
  const base = `games/${state.gameId}/v${state.version}`;
  const assetUrl = await uploadHtml(`${base}/index.html`, state.html);
  console.log(`[graph:uploadAssets] assetUrl=${assetUrl}`);
  return { assetUrl };
}

async function screenshotNode(state: State): Promise<Partial<State>> {
  try {
    const buf = await takeScreenshot(state.html);
    const base = `games/${state.gameId}/v${state.version}`;
    const thumbnailUrl = await uploadPng(`${base}/thumbnail.png`, buf);
    console.log(`[graph:screenshot] thumbnailUrl=${thumbnailUrl}`);
    return { thumbnailUrl };
  } catch (err) {
    console.warn(`[graph:screenshot] skipped for ${state.gameId}:`, err);
    return { thumbnailUrl: null };
  }
}

async function saveResultNode(state: State): Promise<Partial<State>> {
  const { data: current } = await supabase
    .from('games')
    .select('status')
    .eq('id', state.gameId)
    .single();

  if (current?.status === 'failed') {
    console.log(`[graph:saveResult] game=${state.gameId} was cancelled, skipping`);
    return {};
  }

  await supabase
    .from('games')
    .update({
      status: 'draft',
      asset_url: state.assetUrl,
      thumbnail_url: state.thumbnailUrl,
      version: state.version,
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.gameId);
  console.log(`[graph:saveResult] game=${state.gameId} saved as draft`);
  return {};
}

// ── Conditional routing ───────────────────────────────────────────────────────

function routeAfterValidation(state: State): 'generateGame' | 'uploadAssets' {
  if (state.validationError && state.retries < MAX_RETRIES) {
    console.log(
      `[graph:route] retry ${state.retries}/${MAX_RETRIES} — ${state.validationError}`,
    );
    return 'generateGame';
  }
  return 'uploadAssets';
}

// ── Graph ─────────────────────────────────────────────────────────────────────

const workflow = new StateGraph(GameState)
  .addNode('loadPrompts',    loadPrompts)
  .addNode('generateMeta',   generateMetaNode)
  .addNode('ragEnhance',     ragEnhanceNode)
  .addNode('generateGame',   generateGameNode)
  .addNode('validateHtml',   validateHtmlNode)
  .addNode('uploadAssets',   uploadAssetsNode)
  .addNode('screenshot',     screenshotNode)
  .addNode('saveResult',     saveResultNode)
  .addEdge(START,            'loadPrompts')
  .addEdge('loadPrompts',    'generateMeta')
  .addEdge('generateMeta',   'ragEnhance')
  .addEdge('ragEnhance',     'generateGame')
  .addEdge('generateGame',   'validateHtml')
  .addConditionalEdges('validateHtml', routeAfterValidation, {
    generateGame:  'generateGame',
    uploadAssets:  'uploadAssets',
  })
  .addEdge('uploadAssets',   'screenshot')
  .addEdge('screenshot',     'saveResult')
  .addEdge('saveResult',     END);

export const gameGraph = workflow.compile();

// ── Public entry point ────────────────────────────────────────────────────────

const _runGraph = traceable(
  async (gameId: string, version: number) => {
    await gameGraph.invoke({ gameId, version });
  },
  { name: 'game-generation', run_type: 'chain' },
);

export async function runGameGraph(gameId: string, version: number): Promise<void> {
  console.log(`[graph] starting — game=${gameId} v${version}`);
  try {
    await _runGraph(gameId, version);
    console.log(`[graph] done — game=${gameId}`);
  } catch (err) {
    console.error(`[graph] fatal error for game ${gameId}:`, err);
    await supabase
      .from('games')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', gameId);
  }
}
