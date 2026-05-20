import Anthropic from '@anthropic-ai/sdk';
import { wrapAnthropic } from 'langsmith/wrappers/anthropic';

const client = wrapAnthropic(new Anthropic());

// ---------------------------------------------------------------------------
// Game generation — Sonnet 4.6
// ---------------------------------------------------------------------------

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

export async function generateGameHtml(prompts: string[], ragContext = '', gameTitle = ''): Promise<string> {
  const ragBlock = ragContext ? `\n\n${ragContext}\n\n` : '';
  const titleInstruction = gameTitle && gameTitle.length >= 3
    ? `\nIMPORTANT: The game title is "${gameTitle}". Use this exact title in the MenuScene and EndScene — do not invent a different title.\n`
    : '';
  const userContent =
    prompts.length === 1
      ? `${ragBlock}${titleInstruction}Create this game: ${prompts[0]}`
      : `${ragBlock}${titleInstruction}Original game idea: ${prompts[0]}\n\nUser refinements — apply ALL of these:\n${prompts
          .slice(1)
          .map((p, i) => `${i + 1}. ${p}`)
          .join('\n')}\n\nGenerate the complete updated game incorporating every refinement.`;

  // Streaming required for max_tokens > ~4000 (SDK enforces this to avoid timeouts)
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    temperature: 0.7,
    system: GAME_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'max_tokens') {
    throw new Error('max_tokens');
  }

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response type');

  let html = block.text.trim();

  // Strip markdown fences if Claude wrapped it anyway
  if (html.startsWith('```')) {
    html = html.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    throw new Error('Response is not valid HTML');
  }

  return html;
}

// ---------------------------------------------------------------------------
// Title + description — Haiku (cheap, fast)
// ---------------------------------------------------------------------------

export async function generateMeta(
  prompt: string,
): Promise<{ title: string; description: string }> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    temperature: 0.8,
    messages: [
      {
        role: 'user',
        content: `Generate a playful, kid-friendly game title and one-sentence description for this game idea: "${prompt}"

Rules:
- Title: max 40 characters, energetic, no quotes
- Description: max 100 characters, exciting, ends with an emoji

Respond ONLY with valid JSON (no markdown):
{"title": "...", "description": "..."}`,
      },
    ],
  });

  const text = (message.content[0] as { type: 'text'; text: string }).text.trim();

  // Strip markdown fences if Haiku wrapped it anyway
  const cleaned = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();

  try {
    return JSON.parse(cleaned) as { title: string; description: string };
  } catch {
    // Derive a real title from the prompt rather than a generic fallback
    const words = prompt.trim().split(/\s+/).slice(0, 5).join(' ');
    const title = words.length > 0
      ? words.charAt(0).toUpperCase() + words.slice(1)
      : 'My Game';
    return { title, description: 'A super fun game made just for you! 🎮' };
  }
}

// ---------------------------------------------------------------------------
// Multimodality — Claude Vision: image → game prompt (Sonnet 4.6)
// ---------------------------------------------------------------------------

const VISION_SYSTEM = `You are a creative game designer helping kids make games.
The user has uploaded an image (a drawing, sketch, or photo) to inspire a browser game.
Analyze the image and produce a rich game prompt that can be used to generate a Phaser 3 game.

Your output must be a single paragraph (60–120 words) describing:
- Main character(s) or player sprite (shape, color)
- Theme and setting
- Core game mechanic (what the player does: jump, collect, avoid, shoot, race...)
- Win condition (collect N items / survive N seconds / reach the end)
- Visual style (bright, cheerful, specific colors you see in the image)

Do NOT mention technical details like Phaser 3, HTML, or code.
Do NOT use bullet points. Write a single flowing paragraph.
Start with: "Create a game where..."`;

export async function analyzeImageForGame(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: VISION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          {
            type: 'text',
            text: 'Describe this image as a kids game prompt.',
          },
        ],
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected vision response');
  return block.text.trim();
}
