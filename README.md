# Kids Make Games

Type a game idea. Get a playable Phaser 3 browser game in ~30 seconds.

Built as a final project for an LLM Engineering course. The full pipeline — moderation, concept extraction, RAG-augmented generation, validation, and screenshot — runs inside a LangGraph state machine on every request.

---

## What it does

1. User types a prompt (`"a frog that catches flies to score points"`)
2. Three-layer content moderation (gibberish → regex → Claude Haiku)
3. Claude Haiku generates a title and description
4. RAG retrieves relevant Phaser 3 patterns from pgvector
5. Claude Sonnet 4.6 generates a complete self-contained HTML game (32K tokens, streaming)
6. Validation checks for banned API methods; retries with error hint if needed (max 3×)
7. Game is uploaded to Cloudflare R2, screenshot taken with Puppeteer
8. Player gets a live iframe of their game and can refine it with follow-up prompts

Users can also upload a drawing or photo — Claude Vision analyzes it and generates the initial prompt.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind CSS, TypeScript |
| Backend | Express, TypeScript |
| Orchestration | LangGraph JS (`@langchain/langgraph`) |
| Primary LLM | Claude Sonnet 4.6 (game generation, vision) |
| Support LLMs | Claude Haiku 4.5 (moderation, meta generation) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Vector DB | Supabase pgvector |
| Storage | Cloudflare R2 (game HTML + screenshots) |
| Database | Supabase (PostgreSQL) |
| Screenshots | Puppeteer headless Chrome |
| Tracing | LangSmith |
| MCP | `@modelcontextprotocol/sdk` (3 tools) |

---

## Local setup

**Prerequisites:** Node.js 18+, a Supabase project, Cloudflare R2 bucket, Anthropic API key, OpenAI API key, LangSmith API key.

### 1. Database

Run `supabase/schema.sql` in the Supabase SQL editor. This creates the `games`, `prompts`, and `phaser_docs` tables and the `match_phaser_docs` RPC function.

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in all values (see below)
npm install
npm run ingest:curated  # one-time: inserts curated Phaser patterns into pgvector (reliable)
# npm run ingest       # alternative: also scrapes phaser.io docs (may time out)
npm run dev            # starts on http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # starts on http://localhost:3000
```

### 4. MCP server (optional — for Claude Code integration)

```bash
cd mcp
npm install
npm run dev
```

---

## Environment variables

All required. Put these in `backend/.env`:

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=KidsMakeGames
```

---

## Running evals

```bash
cd evals
npm install
npx tsx run-evals.ts --quick    # 5 games, ~7 min
npx tsx run-evals.ts            # full 28-game run, ~44 min, ~$4 in API costs
```

Outputs `EVALS.md` with validity rate, playability scores, and A/B experiment results.

---

## Key scripts

| Command | What it does |
|---|---|
| `cd backend && npm run dev` | Start backend (port 3001) |
| `cd frontend && npm run dev` | Start frontend (port 3000) |
| `cd backend && npm run ingest:curated` | Insert curated Phaser patterns into pgvector (reliable, run once) |
| `cd mcp && npm run dev` | Start MCP server over stdio |
| `cd evals && npx tsx run-evals.ts` | Run evaluation suite |

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, LangGraph flow, RAG pipeline details, and key technical decisions.
