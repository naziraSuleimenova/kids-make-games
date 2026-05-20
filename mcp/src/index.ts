#!/usr/bin/env node
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ── Clients ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ── Constants ─────────────────────────────────────────────────────────────────

const BANNED_METHODS = ['fillStar', 'drawStar', 'fillPolygon', 'fillEllipse', 'fillArc'];
const REQUIRED_SCENES = ['MenuScene', 'GameScene', 'EndScene'];
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(prompt|instruction|rule)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /act\s+as\s+(a|an)\s+/i,
  /jailbreak/i,
  /\b(porn|xxx|nude|naked|sex)\b/i,
  /\b(kill|murder|gore|blood|violence)\b/i,
  /\b(bomb|weapon|drug|cocaine)\b/i,
];

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'kids-make-games', version: '1.0.0' });

// ── Tool 1: moderate_content ──────────────────────────────────────────────────

// @ts-ignore MCP SDK generic depth
server.registerTool(
  'moderate_content',
  {
    description: 'Check whether a game prompt is safe for children aged 8-12. Runs 3-layer pipeline: gibberish detection → regex patterns → Claude Haiku semantic check. Returns {safe, layer, reason}.',
    inputSchema: { prompt: z.string().describe('Game prompt to moderate') },
  },
  async ({ prompt }) => {
    // Layer 1: gibberish / too short
    if (prompt.trim().split(/\s+/).length < 2) {
      return textResult({ safe: false, layer: 1, reason: 'Prompt is too short.' });
    }
    const alphaRatio = (prompt.match(/[a-zA-Z]/g)?.length ?? 0) / prompt.length;
    if (alphaRatio < 0.4 && prompt.length > 10) {
      return textResult({ safe: false, layer: 1, reason: 'Appears to be gibberish.' });
    }

    // Layer 2: regex
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(prompt)) {
        return textResult({ safe: false, layer: 2, reason: 'Disallowed content detected.' });
      }
    }

    // Layer 3: Claude Haiku
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Kids game platform moderator (ages 8-12). Is this prompt appropriate? Reply JSON only: {"safe":true/false,"reason":"..."}\n\nPrompt: "${prompt}"`,
      }],
    });
    const raw = (msg.content[0] as { type: 'text'; text: string }).text.trim()
      .replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    try {
      return textResult({ ...JSON.parse(raw), layer: 3 });
    } catch {
      return textResult({ safe: true, layer: 3, reason: 'Parse error — defaulting safe.' });
    }
  },
);

// ── Tool 2: get_phaser_patterns ───────────────────────────────────────────────

// @ts-ignore MCP SDK generic depth
server.registerTool(
  'get_phaser_patterns',
  {
    description: 'Retrieve Phaser 3 code patterns from the RAG knowledge base (pgvector). Use to find relevant game mechanics, API usage examples, and code snippets. Returns up to 5 patterns with similarity scores.',
    inputSchema: { query: z.string().describe('Game mechanic or API feature to look up, e.g. "platformer jumping physics"') },
  },
  async ({ query }) => {
    if (!openai) {
      return textResult({ error: 'OPENAI_API_KEY not configured — RAG unavailable', patterns: [] });
    }

    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const embedding = embeddingRes.data[0].embedding;

    const { data, error } = await supabase.rpc('match_phaser_docs', {
      query_embedding: embedding,
      match_count: 5,
    });

    if (error) {
      return textResult({ error: error.message, patterns: [] });
    }

    type DocRow = { topic: string; content: string; source_url: string; similarity: number };
    const patterns = (data ?? []).map((doc: DocRow) => ({
      topic: doc.topic,
      content: doc.content,
      source_url: doc.source_url,
      similarity: Math.round(doc.similarity * 1000) / 1000,
    }));

    return textResult({ query, count: patterns.length, patterns });
  },
);

// ── Tool 3: validate_phaser_game ──────────────────────────────────────────────

// @ts-ignore MCP SDK generic depth
server.registerTool(
  'validate_phaser_game',
  {
    description: 'Validate a generated Phaser 3 game HTML file. Checks for: banned API methods that crash the game (fillStar, drawStar, etc.), required 3-scene structure (MenuScene/GameScene/EndScene), Phaser CDN script, valid DOCTYPE. Returns {valid, error_count, errors[]}.',
    inputSchema: { html: z.string().describe('Full HTML content of the generated Phaser 3 game') },
  },
  async ({ html }) => {
    const errors: string[] = [];

    const banned = BANNED_METHODS.filter(m => html.includes(`${m}(`));
    if (banned.length > 0) {
      errors.push(`Banned methods (crash at runtime): ${banned.join(', ')}. Use fillCircle, fillRect, or fillPoints instead.`);
    }

    const missingScenes = REQUIRED_SCENES.filter(s => !html.includes(s));
    if (missingScenes.length > 0) {
      errors.push(`Missing required scenes: ${missingScenes.join(', ')}`);
    }

    if (!html.includes('phaser') && !html.includes('Phaser')) {
      errors.push('Phaser CDN script tag not found.');
    }

    if (!html.trimStart().startsWith('<!DOCTYPE') && !html.trimStart().startsWith('<html')) {
      errors.push('Does not start with <!DOCTYPE html>.');
    }

    return textResult({ valid: errors.length === 0, error_count: errors.length, errors });
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] KidsMakeGames server running on stdio');
}

main().catch(console.error);
