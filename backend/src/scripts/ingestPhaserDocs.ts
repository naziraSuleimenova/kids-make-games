/**
 * One-time ingestion script: scrapes Phaser 3 API docs, chunks by class/topic,
 * embeds with text-embedding-3-small, and stores in Supabase pgvector.
 *
 * Run once (or after major Phaser updates):
 *   npx tsx src/scripts/ingestPhaserDocs.ts
 */

import 'dotenv/config';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { supabase } from '../db/supabase';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Doc sources ───────────────────────────────────────────────────────────────
// Key Phaser 3 API pages most relevant to game generation
const SOURCES = [
  { url: 'https://newdocs.phaser.io/docs/3.80.1/Phaser.GameObjects.Graphics', topic: 'Graphics API' },
  { url: 'https://newdocs.phaser.io/docs/3.80.1/Phaser.Physics.Arcade.ArcadePhysics', topic: 'Arcade Physics' },
  { url: 'https://newdocs.phaser.io/docs/3.80.1/Phaser.GameObjects.Text', topic: 'Text' },
  { url: 'https://newdocs.phaser.io/docs/3.80.1/Phaser.Tweens.TweenManager', topic: 'Tweens' },
  { url: 'https://newdocs.phaser.io/docs/3.80.1/Phaser.Input.Keyboard.KeyboardPlugin', topic: 'Keyboard Input' },
  { url: 'https://newdocs.phaser.io/docs/3.80.1/Phaser.Scene', topic: 'Scene' },
  { url: 'https://newdocs.phaser.io/docs/3.80.1/Phaser.GameObjects.Sprite', topic: 'Sprite' },
];

// ── Curated patterns ──────────────────────────────────────────────────────────
// High-value patterns that are hard to scrape but critical for game quality.
// These supplement the scraped content.
const CURATED: Array<{ topic: string; content: string; source_url: string }> = [
  {
    topic: 'Texture generation without external assets',
    source_url: 'https://phaser.io/examples',
    content: `
RULE: Never use external image URLs. Always generate textures in preload() using this exact pattern:

preload() {
  // Square / rectangle sprite
  const g = this.make.graphics({ add: false });
  g.fillStyle(0xff6600);
  g.fillRect(0, 0, 48, 48);
  g.generateTexture('player', 48, 48);
  g.destroy();

  // Circle sprite
  const cg = this.make.graphics({ add: false });
  cg.fillStyle(0xffdd00);
  cg.fillCircle(16, 16, 16);
  cg.generateTexture('coin', 32, 32);
  cg.destroy();

  // Star shape — use fillPoints (fillStar does NOT exist)
  const sg = this.make.graphics({ add: false });
  sg.fillStyle(0xffff00);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 14 : 6;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push({ x: 16 + r * Math.cos(a), y: 16 + r * Math.sin(a) });
  }
  sg.fillPoints(pts, true);
  sg.generateTexture('star', 32, 32);
  sg.destroy();

  // Rounded rectangle
  const rg = this.make.graphics({ add: false });
  rg.fillStyle(0x44bb44);
  rg.fillRoundedRect(0, 0, 200, 24, 8);
  rg.generateTexture('platform', 200, 24);
  rg.destroy();
}

BANNED methods that crash the game: fillStar, drawStar, fillPolygon, fillEllipse, fillArc.
VALID Graphics methods: fillRect, fillCircle, fillTriangle, fillPoints, fillRoundedRect, lineStyle, strokeRect, strokeCircle.
`.trim(),
  },
  {
    topic: 'Arcade physics setup and collision',
    source_url: 'https://phaser.io/examples',
    content: `
Arcade physics config (gravity y=300 for platformers, y=0 for top-down):

const config = {
  type: Phaser.AUTO,
  width: 800, height: 600,
  physics: { default: 'arcade', arcade: { gravity: { y: 300 }, debug: false } },
  scene: [MenuScene, GameScene, EndScene]
};

// Static group for platforms (don't move)
this.platforms = this.physics.add.staticGroup();
this.platforms.create(400, 580, 'platform');

// Dynamic sprite for player
this.player = this.physics.add.sprite(100, 450, 'player');
this.player.setCollideWorldBounds(true);
this.player.setBounce(0.1);

// Collision between player and platforms
this.physics.add.collider(this.player, this.platforms);

// Overlap for collecting items
this.physics.add.overlap(this.player, this.stars, this.collectStar, null, this);

collectStar(player, star) {
  star.destroy();
  this.score += 10;
  this.scoreText.setText('Score: ' + this.score);
}
`.trim(),
  },
  {
    topic: 'Scene lifecycle and transitions',
    source_url: 'https://phaser.io/examples',
    content: `
Three required scenes: MenuScene, GameScene, EndScene.

class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }
  create() {
    this.add.text(400, 200, 'GAME TITLE', { fontSize: '48px', color: '#ffdd00', fontFamily: 'Arial Black' }).setOrigin(0.5);
    this.add.text(400, 320, 'Arrow keys to move • SPACE to jump', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(400, 420, 'Click or press SPACE to play', { fontSize: '20px', color: '#aaaaff' }).setOrigin(0.5);
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
    this.input.on('pointerdown', () => this.scene.start('GameScene'));
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }
  create() {
    this.score = 0;
    this.scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '20px', color: '#ffffff' });
    // ... game logic ...
  }
  // Win:  this.scene.start('EndScene', { score: this.score, won: true });
  // Lose: this.scene.start('EndScene', { score: this.score, won: false });
}

class EndScene extends Phaser.Scene {
  constructor() { super({ key: 'EndScene' }); }
  init(data) { this.finalScore = data.score; this.won = data.won; }
  create() {
    const msg = this.won ? 'YOU WIN! 🎉' : 'GAME OVER';
    const color = this.won ? '#ffdd00' : '#ff4444';
    this.add.text(400, 220, msg, { fontSize: '52px', color, fontFamily: 'Arial Black' }).setOrigin(0.5);
    this.add.text(400, 310, 'Score: ' + this.finalScore, { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    const btn = this.add.text(400, 420, '▶ Play Again', { fontSize: '26px', color: '#ffffff', backgroundColor: '#6644cc', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive();
    btn.on('pointerdown', () => this.scene.start('MenuScene'));
  }
}
`.trim(),
  },
  {
    topic: 'Keyboard input and player movement',
    source_url: 'https://phaser.io/examples',
    content: `
// Set up cursor keys in create():
this.cursors = this.input.keyboard.createCursorKeys();
// Optional WASD:
this.wasd = this.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });

// In update():
update() {
  const onGround = this.player.body.blocked.down;

  if (this.cursors.left.isDown || this.wasd.left.isDown) {
    this.player.setVelocityX(-200);
  } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
    this.player.setVelocityX(200);
  } else {
    this.player.setVelocityX(0);
  }

  if ((this.cursors.up.isDown || this.cursors.space.isDown) && onGround) {
    this.player.setVelocityY(-450);
  }
}

// Top-down movement:
update() {
  this.player.setVelocity(0);
  if (this.cursors.left.isDown)  this.player.setVelocityX(-200);
  if (this.cursors.right.isDown) this.player.setVelocityX(200);
  if (this.cursors.up.isDown)    this.player.setVelocityY(-200);
  if (this.cursors.down.isDown)  this.player.setVelocityY(200);
}
`.trim(),
  },
  {
    topic: 'Tweens for visual feedback',
    source_url: 'https://phaser.io/examples',
    content: `
// Flash an object on hit:
this.tweens.add({
  targets: this.player,
  alpha: 0,
  duration: 100,
  yoyo: true,
  repeat: 3,
});

// Scale pop on collect:
this.tweens.add({
  targets: star,
  scaleX: 2,
  scaleY: 2,
  alpha: 0,
  duration: 200,
  onComplete: () => star.destroy(),
});

// Bounce idle animation:
this.tweens.add({
  targets: this.player,
  y: this.player.y - 10,
  duration: 600,
  yoyo: true,
  repeat: -1,
  ease: 'Sine.easeInOut',
});

// Timer countdown:
this.timeLeft = 60;
this.timerText = this.add.text(700, 16, 'Time: 60', { fontSize: '20px', color: '#ffffff' }).setOrigin(1, 0);
this.time.addEvent({
  delay: 1000,
  repeat: 59,
  callback: () => {
    this.timeLeft--;
    this.timerText.setText('Time: ' + this.timeLeft);
    if (this.timeLeft <= 0) this.scene.start('EndScene', { score: this.score, won: false });
  }
});
`.trim(),
  },
  {
    topic: 'Group management and enemy spawning',
    source_url: 'https://phaser.io/examples',
    content: `
// Spawning enemies from a group:
create() {
  this.enemies = this.physics.add.group();
  this.spawnTimer = this.time.addEvent({
    delay: 1500,
    loop: true,
    callback: this.spawnEnemy,
    callbackScope: this,
  });
  this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, null, this);
}

spawnEnemy() {
  const x = Phaser.Math.Between(50, 750);
  const e = this.enemies.create(x, 0, 'enemy');
  e.setVelocityY(Phaser.Math.Between(100, 250));
}

hitEnemy(player, enemy) {
  enemy.destroy();
  this.lives--;
  this.livesText.setText('Lives: ' + this.lives);
  if (this.lives <= 0) this.scene.start('EndScene', { score: this.score, won: false });
}

// Collecting items from a static group:
create() {
  this.stars = this.physics.add.staticGroup();
  for (let i = 0; i < 12; i++) {
    this.stars.create(Phaser.Math.Between(50, 750), Phaser.Math.Between(50, 550), 'star');
  }
  this.physics.add.overlap(this.player, this.stars, (player, star) => {
    star.destroy();
    this.score += 10;
    this.scoreText.setText('Score: ' + this.score);
    if (this.stars.countActive() === 0) {
      this.scene.start('EndScene', { score: this.score, won: true });
    }
  });
}
`.trim(),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function scrapeUrl(url: string, topic: string): Promise<Array<{ topic: string; content: string; source_url: string }>> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 KidsMakeGames-RAG-Ingestion/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`  [skip] ${url} — HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove nav, footer, scripts
    $('nav, footer, script, style, .sidebar, .breadcrumb').remove();

    // Extract method entries — each method becomes its own chunk
    const chunks: Array<{ topic: string; content: string; source_url: string }> = [];
    $('section, .member-item, .member, article').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 100 && text.length < 3000) {
        chunks.push({ topic, content: text, source_url: url });
      }
    });

    // Fallback: take the whole page body if no sections found
    if (chunks.length === 0) {
      const body = $('main, body').text().replace(/\s+/g, ' ').trim().slice(0, 4000);
      if (body.length > 200) chunks.push({ topic, content: body, source_url: url });
    }

    console.log(`  [ok] ${url} → ${chunks.length} chunks`);
    return chunks;
  } catch (err) {
    console.warn(`  [skip] ${url} — ${(err as Error).message}`);
    return [];
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  return res.data.map(d => d.embedding);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phaser 3 docs ingestion ===\n');

  // 1. Collect chunks
  const chunks: Array<{ topic: string; content: string; source_url: string }> = [
    ...CURATED,
  ];

  console.log('Scraping Phaser 3 API docs...');
  for (const { url, topic } of SOURCES) {
    const scraped = await scrapeUrl(url, topic);
    chunks.push(...scraped);
  }
  console.log(`\nTotal chunks: ${chunks.length}`);

  // 2. Clear existing docs so re-runs are idempotent
  console.log('\nClearing existing phaser_docs...');
  const { error: delErr } = await supabase.from('phaser_docs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw delErr;

  // 3. Embed in batches of 20 and upsert
  const BATCH = 20;
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    console.log(`Embedding batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(chunks.length / BATCH)}...`);
    const embeddings = await embedBatch(batch.map(c => `${c.topic}\n\n${c.content}`));

    const rows = batch.map((c, j) => ({
      topic: c.topic,
      content: c.content,
      source_url: c.source_url,
      embedding: JSON.stringify(embeddings[j]),
    }));

    const { error } = await supabase.from('phaser_docs').insert(rows);
    if (error) throw error;
    inserted += rows.length;
  }

  console.log(`\n✓ Ingested ${inserted} chunks into phaser_docs`);
}

main().catch(err => {
  console.error('[ingest] fatal:', err);
  process.exit(1);
});
