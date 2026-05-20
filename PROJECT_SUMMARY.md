# Kids Bricks Games — Project Summary

## What It Is

An AI-powered game generator for kids. Users type a plain-English prompt, and the platform generates a fully playable Phaser 3 browser game — no code required. Games can be refined with follow-up prompts and published to a public gallery.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, TypeScript |
| Backend | Node.js, Express, TypeScript |
| AI | Anthropic Claude API — Sonnet 4.6 (generation), Haiku (meta + moderation) |
| Database | Supabase (PostgreSQL) |
| Storage | Cloudflare R2 (S3-compatible) |
| Job Queue | Inngest (serverless async workflows) |
| Screenshots | Puppeteer (headless Chrome) |
| Validation | Zod |

---

## Architecture

```
User types prompt
  → Frontend: gibberish check (client-side, free)
  → POST /api/games
  → Backend: rate limit → pattern check → Claude Haiku moderation
  → Inngest event: game/generate
      Step 1: Claude Haiku → title + description → save to Supabase
      Step 2 (single step): Claude Sonnet → HTML → Puppeteer screenshot → R2 upload
      Step 3: Update Supabase (status: draft, asset_url, thumbnail_url)
  → Frontend polls /api/games/:id every 3s until status !== 'generating'
  → User previews, refines, publishes
  → Published games appear in gallery
```

---

## Repo Structure

```
kids-bricks-games/
├── backend/
│   ├── src/
│   │   ├── index.ts                        # Express entry point
│   │   ├── types/index.ts
│   │   ├── constants/messages.ts           # Kid-friendly error messages
│   │   ├── db/supabase.ts
│   │   ├── middleware/rateLimit.ts         # 5 games/hr per IP
│   │   ├── routes/games.ts                 # All game API endpoints
│   │   ├── inngest/
│   │   │   ├── client.ts
│   │   │   └── functions/generate-game.ts  # Async generation workflow
│   │   └── services/
│   │       ├── claude.ts                   # Generation + validation
│   │       ├── moderation.ts               # 3-layer content safety
│   │       ├── r2.ts                       # Cloudflare R2 uploads
│   │       └── screenshot.ts               # Puppeteer screenshots
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                      # Header, balloon bg
│   │   ├── page.tsx                        # Home + default game
│   │   ├── create/page.tsx                 # Prompt form
│   │   └── games/
│   │       ├── page.tsx                    # Public gallery
│   │       └── [id]/page.tsx               # Game editor + player
│   ├── components/
│   │   ├── BalloonBackground.tsx           # Poppable animated balloons
│   │   ├── GameCard.tsx                    # Gallery card
│   │   ├── GamePlayer.tsx                  # Sandboxed iframe
│   │   └── PromptForm.tsx                  # Create/refine form
│   ├── lib/api.ts                          # REST client
│   └── package.json
├── public/default-game.html               # Built-in Phaser 3 demo game
├── TODO.md
└── PROJECT_SUMMARY.md
```

---

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/games` | List all published games |
| `GET` | `/api/games/:id` | Get game + prompt history |
| `POST` | `/api/games` | Create game from first prompt |
| `POST` | `/api/games/:id/prompts` | Add refinement prompt |
| `POST` | `/api/games/:id/publish` | Publish draft |
| `POST` | `/api/games/:id/report` | Report game (auto-hides at 3 reports) |
| `GET` | `/health` | Health check |
| `POST` | `/api/inngest` | Inngest webhook handler |

---

## Database Schema

### `games`
```sql
id            uuid PRIMARY KEY
title         text
description   text
status        text  -- 'generating' | 'draft' | 'published' | 'failed'
version       integer
asset_url     text  -- R2 public URL for game HTML
thumbnail_url text  -- R2 public URL for screenshot PNG
created_at    timestamptz
updated_at    timestamptz
```

### `prompts`
```sql
id         uuid PRIMARY KEY
game_id    uuid REFERENCES games(id) ON DELETE CASCADE
content    text
version    integer
created_at timestamptz
```

---

## Environment Variables

### Backend (`backend/.env`)
```
PORT=3001
FRONTEND_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
R2_ENDPOINT=https://xxxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=kids-bricks-games
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
INNGEST_BASE_URL=http://localhost:8288
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## How to Run

```bash
# Terminal 1 — Backend
cd backend && npm install && npm run dev

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev

# Terminal 3 — Inngest dev server (for local job processing)
npx inngest-cli@latest dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Inngest dashboard: http://localhost:8288

---

## Key Design Decisions

### 1. Single Inngest step for generate + upload
Large HTML strings get silently truncated when passed between Inngest steps via JSON serialization. Merging generate, screenshot, and upload into one step avoids this entirely.

### 2. Claude max_tokens: 32000
Complex Phaser 3 games with multiple scenes can exceed 16K tokens. Raised to 32K with explicit `stop_reason === 'max_tokens'` detection that marks the game as failed with a user-friendly message.

### 3. iframe sandbox: `allow-scripts allow-same-origin`
`allow-same-origin` is required for Phaser's WebGL/canvas APIs when the game HTML is served from a different origin (Cloudflare R2). Without it, the canvas initializes but renders a black screen.

### 4. Three-layer content moderation
- **Layer 1** (client): Gibberish detection — instant, free
- **Layer 2** (server): Regex — injection patterns, escalation scoring across prompt history
- **Layer 3** (server): Claude Haiku — semantic understanding, sanitization ("shoot enemies" → "pop bubbles")

### 5. Composable prompt history
On each refinement, the full prompt history is sent to Claude as a single generation request — not an incremental patch. This produces more coherent games than trying to diff/patch the previous HTML.

---

## Content Moderation System Prompt

Use this as a system prompt in a Claude Haiku call before each game generation:

```
You are a content moderator for a kids' game creation platform designed for children ages 4–12.
Review user-submitted game prompts and decide whether they are safe and appropriate.

REJECT prompts that contain or imply:
- Violence, gore, weapons, shooting, stabbing, killing, blood, injury, or death
- Fighting mechanics where the intent is harm
- Sexual, romantic, or suggestive content of any kind
- Drugs, alcohol, smoking, vaping, or gambling
- Horror themes, jump scares, or anything intended to frighten a child
- Real-world political figures, politicians, or political events
- Hate speech, slurs, bullying, discrimination, or content targeting a group
- Personal data collection

ALLOW: platformers, puzzles, racing, collecting, fantasy creatures, space, nature, animals, sports, educational content, classic arcade mechanics.

SANITIZE rather than reject when possible:
- "shoot enemies" → "pop bubbles"
- "kill the boss" → "outsmart the boss"
- "fight zombies" → "chase away spooky ghosts"

Respond with ONLY valid JSON, no markdown:
{"allowed": true|false, "reason": "short explanation if rejected, empty string if allowed", "sanitized_prompt": "cleaned prompt if allowed, empty string if rejected", "was_sanitized": true|false}
```

---

## Constraints & Limits

| Constraint | Value |
|-----------|-------|
| Prompt length | 10–240 characters |
| Follow-up prompts per game | Max 10 |
| Games per IP per hour | Max 5 |
| Game canvas size | 800×600 px |
| Max game HTML size | 500 KB |
| Generation time | ~20–40 seconds |
| Frontend polling interval | 3 seconds |
| Inngest retries | 2 |
| Screenshot wait | networkidle0 + 3s |
