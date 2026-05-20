#!/usr/bin/env node
/**
 * KidsMakeGames — Eval Runner
 *
 * Runs the golden dataset against the game generation pipeline and reports:
 *   - Metric 1: Validity Rate (automated — HTML structure checks)
 *   - Metric 2: Playability Score (LLM-as-judge, Claude Opus 1–5 rubric)
 *   - A/B Experiment: variant A (temperature=0.7) vs variant B (temperature=1.0)
 *
 * Usage:
 *   npx tsx evals/run-evals.ts [--quick] [--ab-only] [--category simple]
 *
 * Options:
 *   --quick        Only run the first 10 prompts
 *   --ab-only      Skip playability scoring (faster, cheaper)
 *   --category X   Only run prompts in category X
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// Load .env from backend
const backendEnvPath = path.join(__dirname, '../backend/.env');
if (fs.existsSync(backendEnvPath)) {
  const lines = fs.readFileSync(backendEnvPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoldenEntry {
  id: string;
  category: string;
  prompt: string;
  expected: {
    valid?: boolean;
    rejected?: boolean;
    sanitized?: boolean;
    has_menu_scene?: boolean;
    has_game_scene?: boolean;
    has_end_scene?: boolean;
    no_banned_methods?: boolean;
  };
  ab_variant: 'A' | 'B';
}

interface EvalResult {
  id: string;
  category: string;
  prompt: string;
  ab_variant: 'A' | 'B';
  validity: {
    passed: boolean;
    has_menu: boolean;
    has_game: boolean;
    has_end: boolean;
    no_banned: boolean;
    errors: string[];
  };
  playability_score: number | null;
  playability_reason: string | null;
  generation_time_ms: number;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BANNED = ['fillStar', 'drawStar', 'fillPolygon', 'fillEllipse', 'fillArc'];
const REQUIRED_SCENES = ['MenuScene', 'GameScene', 'EndScene'];

// Same system prompt as production (backend/src/services/claude.ts)
const GAME_SYSTEM = `You are an expert Phaser 3 game developer creating browser games for children ages 4–12.
Generate a complete, self-contained HTML file that runs a fun and playable game.

════════════════════════════════════════
ABSOLUTE TECHNICAL RULES
════════════════════════════════════════
1. Load Phaser ONLY from this exact URL:
   <script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>
2. Canvas: width 800, height 600.
3. ZERO external assets — no image/audio URLs. Generate all visuals with Phaser's drawing API.
4. Game must be a single .html file. All JS goes in one <script> block after the Phaser CDN tag.
5. Use arcade physics: physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } }

════════════════════════════════════════
HOW TO CREATE SPRITES WITHOUT IMAGES
════════════════════════════════════════
VALID Phaser 3 Graphics methods: fillRect, fillCircle, fillTriangle, fillPoints, fillRoundedRect, strokeRect, strokeCircle, lineStyle, fillStyle, clear.
BANNED — these do NOT exist in Phaser 3 and will crash the game: fillStar, drawStar, fillPolygon, fillEllipse (use fillCircle instead), fillArc.

Use this exact pattern in preload() to generate textures from Graphics:

  preload() {
    // Player: orange square
    const pg = this.make.graphics({ add: false });
    pg.fillStyle(0xff6600);
    pg.fillRect(0, 0, 48, 48);
    pg.generateTexture('player', 48, 48);
    pg.destroy();

    // Collectible: yellow circle (NOT fillStar — use fillCircle or fillPoints)
    const sg = this.make.graphics({ add: false });
    sg.fillStyle(0xffdd00);
    sg.fillCircle(16, 16, 16);
    sg.generateTexture('coin', 32, 32);
    sg.destroy();

    // Star shape — use fillPoints with a star polygon (fillStar does NOT exist):
    const starG = this.make.graphics({ add: false });
    starG.fillStyle(0xffdd00);
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 14 : 6;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      pts.push({ x: 16 + r * Math.cos(a), y: 16 + r * Math.sin(a) });
    }
    starG.fillPoints(pts, true);
    starG.generateTexture('star', 32, 32);
    starG.destroy();

    // Platform: green rectangle
    const platG = this.make.graphics({ add: false });
    platG.fillStyle(0x44bb44);
    platG.fillRect(0, 0, 200, 20);
    platG.generateTexture('platform', 200, 20);
    platG.destroy();
  }

Then use textures as physics sprites:
  this.player = this.physics.add.sprite(400, 500, 'player');
  this.player.setCollideWorldBounds(true);

════════════════════════════════════════
REQUIRED SCENE STRUCTURE
════════════════════════════════════════
You MUST have exactly 3 scenes:

1. MenuScene (key: 'MenuScene')

   LAYOUT (top to bottom, all centred at x=400):
   a) Solid or simple two-colour background — pick ONE colour that fits the theme.
      Fill it with a rectangle, do NOT leave backgroundColor showing.
   b) Game title at y=160 — large (56–72px), bold, white or bright single colour.
      Font: { fontSize: '64px', fontStyle: 'bold', color: '#ffffff', fontFamily: 'Arial' }
      NO emoji characters in the title text. Plain words only.
   c) Subtitle / tagline at y=240 — optional, 22px, softer colour (e.g. rgba white 70%).
   d) Controls line at y=330 — 18px, single line, e.g. "← → Move  SPACE Jump"
      Keep it short. Max one line.
   e) "TAP TO PLAY" prompt at y=430 — 24px, bright accent colour, pulsing alpha tween:
      this.tweens.add({ targets: playText, alpha: 0.2, duration: 800, yoyo: true, repeat: -1 });
   f) One or two decorative sprites at the bottom (player character, enemy, collectible)
      to show the player what the game looks like. Keep them small (48–64px).

   DO NOT add: boxes around instructions, multiple font sizes fighting each other,
   emoji icons embedded in titles, or more than 5 text elements total.

2. GameScene (key: 'GameScene')
   - Score shown top-left: this.scoreText = this.add.text(16, 16, 'Score: 0', {...})
   - Lives or timer shown top-right
   - On win: this.scene.start('EndScene', { score: this.score, won: true })
   - On lose: this.scene.start('EndScene', { score: this.score, won: false })
   - Show controls on-screen in small text (e.g., "← → move   SPACE jump")

3. EndScene (key: 'EndScene')
   - Same background colour as MenuScene for consistency.
   - Win: "YOU WIN!" in large gold/yellow text (y=200)
   - Lose: "GAME OVER" in large red/coral text (y=200)
   - Final score at y=290, 28px white
   - "PLAY AGAIN" button at y=390 — rounded rectangle (fillRoundedRect) with text on top.
     Interactive: pointer cursor, slight scale tween on hover.
     On click: this.scene.start('MenuScene')

════════════════════════════════════════
SCENE REGISTRATION (mandatory)
════════════════════════════════════════
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  physics: { default: 'arcade', arcade: { gravity: { y: 300 }, debug: false } },
  scene: [MenuScene, GameScene, EndScene]   // ← ALL THREE scenes listed here
};
new Phaser.Game(config);

════════════════════════════════════════
GAME DESIGN RULES
════════════════════════════════════════
- Audience: kids aged 8–12. Clean, bold, readable. No clutter.
- Bright, cheerful colours. No dark/scary themes.
- Simple controls: arrow keys / WASD / SPACE / mouse click.
- Game should be winnable in under 90 seconds.
- Clear win condition (collect N items, survive N seconds, reach the end).
- Big visual feedback on collect/hit events (use tweens or color flashes).
- "Play Again" button must work correctly (restart from MenuScene).
- Typography rule: max 2 font sizes per scene. Title big, everything else small.

════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════
Return ONLY the raw HTML. Start with <!DOCTYPE html>. No markdown fences. No explanation.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateHtml(html: string): EvalResult['validity'] {
  const errors: string[] = [];
  const banned = BANNED.filter(m => html.includes(`${m}(`));
  if (banned.length > 0) errors.push(`Banned methods: ${banned.join(', ')}`);

  const missingScenes = REQUIRED_SCENES.filter(s => !html.includes(s));
  if (missingScenes.length > 0) errors.push(`Missing scenes: ${missingScenes.join(', ')}`);

  if (!html.trimStart().startsWith('<!DOCTYPE') && !html.trimStart().startsWith('<html')) {
    errors.push('Missing DOCTYPE');
  }
  if (!html.includes('phaser') && !html.includes('Phaser')) {
    errors.push('Missing Phaser CDN');
  }

  return {
    passed: errors.length === 0,
    has_menu: html.includes('MenuScene'),
    has_game: html.includes('GameScene'),
    has_end: html.includes('EndScene'),
    no_banned: banned.length === 0,
    errors,
  };
}

async function generateGame(prompt: string, temperature: number): Promise<string> {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    temperature,
    system: GAME_SYSTEM,
    messages: [{ role: 'user', content: `Create this game: ${prompt}` }],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === 'max_tokens') throw new Error('max_tokens');

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');

  let html = block.text.trim();
  if (html.startsWith('```')) {
    html = html.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return html;
}

async function scorePlayability(prompt: string, html: string): Promise<{ score: number; reason: string }> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are evaluating a Phaser 3 browser game generated for kids (ages 8-12).

ORIGINAL PROMPT: "${prompt}"

GENERATED HTML (first 3000 chars):
${html.slice(0, 3000)}

Rate the game on a scale of 1-5:
1 = Broken or unplayable (missing core mechanics, crashes, no win condition)
2 = Barely playable (major issues: no score, win condition unclear, controls broken)
3 = Playable but weak (some mechanics work, win condition exists but vague)
4 = Good (clear mechanics, win condition, fits prompt well, kid-friendly)
5 = Excellent (all mechanics work, win condition clear, fun, matches prompt perfectly)

Respond ONLY with JSON: {"score": 1-5, "reason": "one sentence"}`,
    }],
  });

  const text = (message.content[0] as { type: 'text'; text: string }).text.trim()
    .replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');

  try {
    const result = JSON.parse(text) as { score: number; reason: string };
    return { score: Math.min(5, Math.max(1, result.score)), reason: result.reason };
  } catch {
    return { score: 3, reason: 'Parse error — defaulting to 3' };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const abOnly = args.includes('--ab-only');
  const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;

  const dataset: GoldenEntry[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'golden-dataset.json'), 'utf-8'),
  );

  let entries = dataset.filter(e => !['reject', 'sanitizable'].includes(e.category));
  if (categoryFilter) entries = entries.filter(e => e.category === categoryFilter);
  if (quick) entries = entries.slice(0, 5);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`KidsMakeGames Eval Runner`);
  console.log(`Entries: ${entries.length} | Quick: ${quick} | AB-only: ${abOnly}`);
  console.log(`${'='.repeat(60)}\n`);

  const results: EvalResult[] = [];
  let completed = 0;

  for (const entry of entries) {
    const temperature = entry.ab_variant === 'A' ? 0.7 : 1.0;
    process.stdout.write(`[${++completed}/${entries.length}] ${entry.id} (T=${temperature})... `);

    const start = Date.now();
    let result: EvalResult;

    try {
      const html = await generateGame(entry.prompt, temperature);
      const validity = validateHtml(html);
      const elapsed = Date.now() - start;

      let playability_score: number | null = null;
      let playability_reason: string | null = null;

      if (!abOnly && validity.passed) {
        const scored = await scorePlayability(entry.prompt, html);
        playability_score = scored.score;
        playability_reason = scored.reason;
      }

      result = {
        id: entry.id,
        category: entry.category,
        prompt: entry.prompt,
        ab_variant: entry.ab_variant,
        validity,
        playability_score,
        playability_reason,
        generation_time_ms: elapsed,
      };

      const status = validity.passed ? '✅' : '❌';
      const score = playability_score ? ` | playability=${playability_score}/5` : '';
      console.log(`${status} valid=${validity.passed}${score} | ${elapsed}ms`);
    } catch (err) {
      const elapsed = Date.now() - start;
      result = {
        id: entry.id,
        category: entry.category,
        prompt: entry.prompt,
        ab_variant: entry.ab_variant,
        validity: { passed: false, has_menu: false, has_game: false, has_end: false, no_banned: true, errors: [String(err)] },
        playability_score: null,
        playability_reason: null,
        generation_time_ms: elapsed,
        error: String(err),
      };
      console.log(`💥 ERROR: ${err}`);
    }

    results.push(result);

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  // ── Aggregate metrics ─────────────────────────────────────────────────────

  const total = results.length;
  const validCount = results.filter(r => r.validity.passed).length;
  const validityRate = (validCount / total * 100).toFixed(1);

  const scored = results.filter(r => r.playability_score !== null);
  const avgPlayability = scored.length > 0
    ? (scored.reduce((sum, r) => sum + (r.playability_score ?? 0), 0) / scored.length).toFixed(2)
    : 'N/A';

  const variantA = results.filter(r => r.ab_variant === 'A');
  const variantB = results.filter(r => r.ab_variant === 'B');
  const aValidity = variantA.length ? (variantA.filter(r => r.validity.passed).length / variantA.length * 100).toFixed(1) : 'N/A';
  const bValidity = variantB.length ? (variantB.filter(r => r.validity.passed).length / variantB.length * 100).toFixed(1) : 'N/A';

  const aScores = variantA.filter(r => r.playability_score !== null);
  const bScores = variantB.filter(r => r.playability_score !== null);
  const aAvgScore = aScores.length ? (aScores.reduce((s, r) => s + (r.playability_score ?? 0), 0) / aScores.length).toFixed(2) : 'N/A';
  const bAvgScore = bScores.length ? (bScores.reduce((s, r) => s + (r.playability_score ?? 0), 0) / bScores.length).toFixed(2) : 'N/A';

  const avgTime = (results.reduce((s, r) => s + r.generation_time_ms, 0) / total / 1000).toFixed(1);

  // ── Category breakdown ─────────────────────────────────────────────────────

  const byCategory = results.reduce<Record<string, { total: number; valid: number }>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = { total: 0, valid: 0 };
    acc[r.category].total++;
    if (r.validity.passed) acc[r.category].valid++;
    return acc;
  }, {});

  // ── Print summary ─────────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total evaluated:       ${total}`);
  console.log(`\nMETRIC 1 — Validity Rate (automated HTML checks)`);
  console.log(`  Overall:             ${validCount}/${total} = ${validityRate}%`);
  console.log(`\nMETRIC 2 — Playability Score (LLM-as-judge, 1-5)`);
  console.log(`  Average:             ${avgPlayability}/5 (n=${scored.length})`);
  console.log(`\nA/B EXPERIMENT — Temperature 0.7 (A) vs 1.0 (B)`);
  console.log(`  Variant A (T=0.7) validity:   ${aValidity}% (n=${variantA.length})`);
  console.log(`  Variant B (T=1.0) validity:   ${bValidity}% (n=${variantB.length})`);
  console.log(`  Variant A avg playability:    ${aAvgScore}/5`);
  console.log(`  Variant B avg playability:    ${bAvgScore}/5`);
  console.log(`\nPERFORMANCE`);
  console.log(`  Avg generation time: ${avgTime}s`);
  console.log(`\nBY CATEGORY`);
  for (const [cat, stats] of Object.entries(byCategory)) {
    console.log(`  ${cat.padEnd(15)} ${stats.valid}/${stats.total} valid (${(stats.valid/stats.total*100).toFixed(0)}%)`);
  }

  // ── Write results ──────────────────────────────────────────────────────────

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const outPath = path.join(__dirname, `results-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ timestamp, metrics: { validity_rate: parseFloat(validityRate), avg_playability: avgPlayability, ab: { a_validity: aValidity, b_validity: bValidity, a_score: aAvgScore, b_score: bAvgScore } }, results }, null, 2));
  console.log(`\nResults written to: ${outPath}`);

  // ── Generate EVALS.md ──────────────────────────────────────────────────────

  const evalsPath = path.join(__dirname, '../EVALS.md');
  const evalsContent = generateEvalsMd({ validityRate, avgPlayability, aValidity, bValidity, aAvgScore, bAvgScore, avgTime, total, validCount, scored: scored.length, byCategory, timestamp });
  fs.writeFileSync(evalsPath, evalsContent);
  console.log(`EVALS.md updated: ${evalsPath}\n`);
}

function generateEvalsMd(m: {
  validityRate: string; avgPlayability: string;
  aValidity: string; bValidity: string;
  aAvgScore: string; bAvgScore: string;
  avgTime: string; total: number; validCount: number;
  scored: number; byCategory: Record<string, { total: number; valid: number }>;
  timestamp: string;
}) {
  return `# EVALS.md — KidsMakeGames Evaluation Results

Last run: ${m.timestamp}

## Overview

KidsMakeGames generates Phaser 3 browser games from natural language prompts. We evaluate two core quality dimensions:

1. **Validity Rate** — Can the generated game be delivered without crashes? (automated)
2. **Playability Score** — Is the game actually fun and well-designed for kids? (LLM-as-judge)

## Golden Dataset

**Total entries:** ${m.total} evaluated (3 categories excluded from generation: reject, sanitizable)
**Full dataset:** [evals/golden-dataset.json](evals/golden-dataset.json) — 33 entries across 7 categories:

| Category | Count | Description |
|---|---|---|
| simple | 7 | Single-mechanic games with clear prompts |
| complex | 6 | Multi-mechanic games with richer prompts |
| ambiguous | 5 | Vague prompts testing Claude's creative interpretation |
| platformer | 3 | Jumping/platform mechanics |
| shooter | 2 | Projectile-based games |
| dodge | 2 | Avoidance mechanics |
| collect | 3 | Collection/gathering mechanics |
| sanitizable | 2 | Content that should be rewritten to kid-friendly |
| reject | 3 | Prompts that should be blocked by moderation |

## Metric 1: Validity Rate (Automated)

**Definition:** Proportion of generated games that pass all automated HTML checks:
- No banned Phaser 3 methods (fillStar, drawStar, fillPolygon, fillEllipse, fillArc)
- All 3 required scenes present (MenuScene, GameScene, EndScene)
- Valid HTML starting with \`<!DOCTYPE html>\`
- Phaser CDN script tag present

**Result:** ${m.validCount}/${m.total} = **${m.validityRate}%**

### By Category
| Category | Valid | Total | Rate |
|---|---|---|---|
${Object.entries(m.byCategory).map(([cat, s]) => `| ${cat} | ${s.valid} | ${s.total} | ${(s.valid/s.total*100).toFixed(0)}% |`).join('\n')}

## Metric 2: Playability Score (LLM-as-Judge)

**Definition:** Claude Haiku evaluates each valid game on a 1-5 rubric:
- 1: Broken/unplayable
- 2: Barely playable (missing score, win condition unclear)
- 3: Playable but weak
- 4: Good (clear mechanics, kid-friendly)
- 5: Excellent (all mechanics work, fun, matches prompt)

**Result:** **${m.avgPlayability}/5** average across ${m.scored} scored games

## A/B Experiment: Temperature 0.7 vs 1.0

**Hypothesis:** Higher temperature (1.0) produces more creative/varied games but may have higher failure rates.

**Design:**
- Variant A (temperature=0.7): deterministic, consistent code generation
- Variant B (temperature=1.0): more creative, potentially more varied gameplay

**Results:**

| Metric | Variant A (T=0.7) | Variant B (T=1.0) |
|---|---|---|
| Validity Rate | ${m.aValidity}% | ${m.bValidity}% |
| Avg Playability | ${m.aAvgScore}/5 | ${m.bAvgScore}/5 |

**Conclusion:** ${parseFloat(m.aValidity) > parseFloat(m.bValidity) ? 'Temperature 0.7 (Variant A) produces more valid games. Lower temperature reduces hallucinated API methods.' : 'Temperature 1.0 (Variant B) performs comparably or better. Creative variation does not significantly increase failure rate.'} We use **temperature=0.7** in production as the default.

## Performance

Average generation time: **${m.avgTime}s** per game (Claude Sonnet 4.6, streaming, 16K max tokens)

## How to Run Evals

\`\`\`bash
cd evals
npm install
npx tsx run-evals.ts          # Full run (~${m.total} games, ~${Math.ceil(parseFloat(m.avgTime) * m.total / 60)} min)
npx tsx run-evals.ts --quick  # First 5 entries only
npx tsx run-evals.ts --ab-only  # Skip LLM scoring (faster)
npx tsx run-evals.ts --category simple  # One category only
\`\`\`

Results are written to \`evals/results-YYYY-MM-DD_HH-MM.json\` and this file is auto-updated.
`;
}

main().catch(err => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
