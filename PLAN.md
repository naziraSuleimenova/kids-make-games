# Kids Bricks Games — Implementation Plan

---

## Phase 1 — Product First (Build This Now)

Get the core loop working end-to-end: prompt → game generated → playable → refineable → published to gallery.

### 1.1 Backend

- **Express + TypeScript** server on port 3001
- **Routes:** `GET /api/games`, `GET /api/games/:id`, `POST /api/games`, `POST /api/games/:id/prompts`, `POST /api/games/:id/publish`, `POST /api/games/:id/report`
- **Content moderation:** 3-layer pipeline
  - Layer 1 (client): gibberish detection — instant, free
  - Layer 2 (server): regex — injection patterns + escalation scoring across prompt history
  - Layer 3 (server): Claude Haiku — semantic check + sanitization ("shoot enemies" → "pop bubbles")
- **Game generation:** Claude Sonnet 4.6 — generates complete self-contained Phaser 3 HTML
- **Meta generation:** Claude Haiku — title + description from the prompt
- **Storage:** Cloudflare R2 (game HTML + thumbnail PNG)
- **Screenshots:** Puppeteer headless Chrome
- **Async jobs:** Inngest — durability, retries, progress tracking
- **Database:** Supabase (PostgreSQL) — games + prompts tables
- **Rate limiting:** 5 games/hr per IP

### 1.2 Frontend

- **Next.js 15** App Router, React 19, Tailwind CSS, TypeScript
- **Pages:**
  - `/` — home with featured demo game + CTA
  - `/create` — prompt form
  - `/games` — published games gallery
  - `/games/[id]` — game player + refinement form + publish button
- **Components:** BalloonBackground, GameCard, GamePlayer, PromptForm
- **Polling:** every 3s while status === 'generating'
- **iframe sandbox:** `allow-scripts allow-same-origin` (required for Phaser WebGL from R2)

### 1.3 Demo Game

- `public/default-game.html` — polished Phaser 3 game shown on the home page
- Shows visitors what the platform can generate before they create their own

---

## Phase 2 — Course Requirements (Layer On After Product Works)

### 2.1 LangGraph Orchestration

- Keep Inngest for async durability; run LangGraph **inside** the Inngest generate function
- Graph nodes: `moderation` → `concept_gen` → `pattern_retrieval` (RAG) → `[human_in_the_loop if ambiguous]` → `code_gen` → `validate` (loop max 3×) → `screenshot` → `quality_score`
- The retry loop on validation is the main value: broken JS → feed error back → regenerate
- Human-in-the-loop: ambiguous prompts ("make a fun game") pause and offer 3 concept options

### 2.2 RAG Pipeline — Phaser 3 Patterns

- Scrape phaser.io examples + API docs (satisfies document/web processing requirement)
- Chunk by code example / API section (semantic boundaries)
- Embed with `text-embedding-3-small` or `voyage-code-2`
- Store in pgvector via Supabase (zero extra infra — already have Postgres)
- Retrieve top-5 patterns based on game type + mechanics → inject into generation prompt
- A/B experiment: RAG on vs RAG off — validity rate + playability score

### 2.3 MCP Server — `kids-game-mcp-server`

- **`moderate_content(prompt)`** — wraps the 3-layer moderation logic
- **`get_game_patterns(game_type, mechanics[])`** — queries pgvector, returns code snippets
- **`validate_phaser_game(html)`** — AST parse with `acorn`, checks syntax + Phaser API misuse

### 2.4 Multimodality

- **Primary:** Image → Game (Claude Vision)
  - User uploads a drawing/photo → Claude Vision extracts characters, theme, mechanics → feeds concept_gen
  - "Draw your hero, we'll make the game" — the demo moment
- **Secondary:** Screenshot quality analysis (Claude Vision rates visual completeness — used in evals, not UX)

### 2.5 LangSmith Tracing

- Wrap all Claude calls with LangSmith native Anthropic integration
- One trace per game generation with child spans for each node
- Track: latency, token usage, retry count, RAG usage

### 2.6 Evals + Golden Dataset

- 30+ test prompts across 5 categories: simple, complex, ambiguous, sanitizable, reject
- **Metric 1:** Game validity rate — automated via `validate_phaser_game`
- **Metric 2:** Playability score — LLM-as-judge (Claude Opus rates 1-5 with rubric)
- Automated runner script → results written to `EVALS.md`
- A/B experiment: RAG vs no-RAG on same 30 prompts

### 2.7 Skill — SKILL.md

- "Game Concept Generator" — triggered when describing a vague game idea
- Produces structured concept: title, mechanics, Phaser 3 approach, estimated complexity

---

## Architecture Decisions (for defense)

| Decision | Choice | Justification |
|---|---|---|
| Orchestration | LangGraph inside Inngest | Inngest = durability; LangGraph = conditional logic |
| Vector DB | pgvector (Supabase) | Already have Postgres; <10K vectors; zero extra infra |
| Embedding | text-embedding-3-small | Good balance of quality and cost for code snippets |
| Primary LLM | Claude Sonnet 4.6 | Best code gen quality; Haiku for cheaper meta + moderation |
| Game validation | AST parser (acorn) | No headless Chrome overhead; catches syntax + bad API calls |
| Multimodality | Claude Vision (image input) | Highest product value; most compelling demo for kids |
| RAG data source | phaser.io docs + examples | Direct source of ground-truth Phaser 3 patterns |

---

## What's Already Done (Keep As-Is After Phase 1)

- 3-layer content moderation (already qualifies as guardrails — name this explicitly at defense)
- Rate limiting (5 games/hr per IP)
- Composable prompt history (full history sent on each refinement — more coherent than patching)
- Gallery + publish flow

---

## Bonus (If Time Allows)

- [ ] Prompt caching on generation system prompt (~40% cost reduction after first call)
- [ ] Fallback: Sonnet unavailable → degrade to Haiku with simpler template
- [ ] Docker + docker-compose for one-command setup
- [ ] Deploy to Railway or Render (public URL)
- [ ] GitHub Actions CI: run evals on every PR
- [ ] User auth via Supabase Auth
- [ ] Voice input via browser Web Speech API

---

## Artifacts Due May 20

- [ ] GitHub repo with full code
- [ ] `README.md` — setup, architecture, screenshots, demo link
- [ ] `ARCHITECTURE.md` — LangGraph + MCP + RAG flow diagram
- [ ] `EVALS.md` — golden dataset, metrics, A/B results
- [ ] Presentation (10-15 slides)
- [ ] LangSmith dashboard screenshots

---

## Key Numbers for Defense Q&A

- Cost per game: ~$0.05–0.15 (Sonnet 32K tokens) + ~$0.001 (Haiku moderation)
- Generation time: ~20–40 seconds
- Retry loop: max 3 attempts before fallback
- Golden dataset: 30+ examples across 5 categories
- Eval metrics: validity rate (automated) + playability score (LLM-as-judge 1-5)
