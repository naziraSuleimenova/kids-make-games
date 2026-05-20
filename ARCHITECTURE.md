# Architecture — Kids Make Games

## System overview

A request flows through four independently deployable pieces:

```
Browser → Next.js frontend → Express backend → LangGraph pipeline
                                    ↓
                            Supabase (PostgreSQL + pgvector)
                            Cloudflare R2 (HTML + PNG storage)
                            LangSmith (trace every LLM call)
```

---

## LangGraph — game generation pipeline

Every game generation (first prompt or refinement) runs through a compiled StateGraph. The graph replaces a simple sequential async function with explicit state, named spans, and a retry loop that would otherwise require nested try/catch logic.

```
START
  │
  ▼
loadPrompts ──────── reads all prompts for this game_id from Supabase
  │
  ▼
generateMeta ──────── Claude Haiku: prompt → {title, description}, saved to DB
  │
  ▼
ragEnhance ────────── OpenAI embed → pgvector similarity search → top-5 Phaser patterns
  │
  ▼
generateGame ─────── Claude Sonnet 4.6 (streaming, 32K tokens): generates full HTML game
  │
  ▼
validateHtml ─────── synchronous: checks for banned methods + required scenes
  │
  ├── FAIL (retries < 3) ──► generateGame  (with error hint injected into prompt)
  │
  └── PASS
        │
        ▼
      uploadAssets ── upload HTML to Cloudflare R2
        │
        ▼
      screenshot ──── Puppeteer headless Chrome → PNG → R2
        │
        ▼
      saveResult ───── write asset_url + thumbnail_url to Supabase, status = 'draft'
        │
        ▼
       END
```

**Conditional logic:** `validateHtml` routes back to `generateGame` if banned Phaser methods are detected or required scenes are missing. The error message is appended to the prompt so Claude fixes the specific issue. Max 3 retries before the graph falls through to upload whatever it has.

**Cancellation safety:** `saveResult` reads current DB status before writing. If the user cancelled mid-generation (status flipped to `failed`), the result is silently discarded.

**State fields:** `gameId`, `version`, `prompts[]`, `gameTitle`, `ragContext`, `html`, `validationError`, `retries`, `assetUrl`, `thumbnailUrl`

---

## RAG pipeline — Phaser 3 knowledge base

**Why RAG here:** Claude Sonnet knows Phaser 3, but it hallucinates non-existent API methods (e.g. `fillStar`, `fillPolygon`) that crash games at runtime. Injecting real API documentation reduces this. The validation+retry loop catches remaining failures.

**Data source:** Phaser 3 API docs scraped from `newdocs.phaser.io` (7 pages) + 6 hand-curated code patterns for the highest-risk generation tasks (texture generation, physics setup, scene transitions).

**Chunking strategy:** Semantic boundaries — one chunk per API class or code pattern, not fixed token windows. API docs chunk ≈ 400–800 tokens; code patterns ≈ 200–500 tokens. Total: ~50 chunks.

**Embedding model:** OpenAI `text-embedding-3-small` (1536 dimensions). Chosen over larger models because code chunks are short and dense; the quality difference vs `text-embedding-3-large` is negligible at this scale, and the cost is 5× lower.

**Vector store:** Supabase pgvector with IVFFlat index (cosine similarity, 50 lists). Zero additional infrastructure — Supabase already runs Postgres.

**Retrieval:** Top-5 chunks by cosine similarity, injected as a structured block before the generation prompt. The query is the concatenation of all user prompts for the game (captures both original idea and refinements).

**Ingest:** One-time script (`npm run ingest`). Re-run after Phaser major version updates.

---

## Content moderation — 3-layer pipeline

Runs on every prompt before any LLM call.

| Layer | Method | Cost | Catches |
|---|---|---|---|
| 1 — Gibberish | Regex: word count, alpha ratio | Free, <1ms | Empty, keyboard mash |
| 2 — Pattern | Regex: injection attempts, escalation word count across history | Free, <1ms | Prompt injection, accumulation attacks |
| 3 — Semantic | Claude Haiku (temp=0, 300 tokens) | ~$0.001 | Edge cases, implied violence, sanitizable content |

Layer 3 sanitizes borderline prompts rather than rejecting them (`"shoot enemies"` → `"pop bubbles"`). Rejection is reserved for content that can't be reframed for kids.

---

## MCP server

Three tools exposed over stdio (`mcp/src/index.ts`):

| Tool | Purpose |
|---|---|
| `moderate_content` | Runs the 3-layer moderation pipeline on a prompt. Returns `{safe, layer, reason}`. |
| `get_phaser_patterns` | Embeds a query and retrieves top-5 patterns from pgvector. Returns chunks with similarity scores. |
| `validate_phaser_game` | Checks generated HTML for banned methods, required scenes, valid DOCTYPE. Returns `{valid, errors[]}`. |

The MCP server reads the same `.env` as the backend and hits the same Supabase instance, so the knowledge base is shared. Useful for using Claude Code to debug or inspect game output during development.

---

## Multimodality — image → game

`POST /api/games/vision` accepts a base64-encoded image (JPEG/PNG/GIF/WebP) and calls Claude Sonnet 4.6 with a vision prompt asking it to describe the image as a kids game concept. The response is a 60–120 word paragraph starting with "Create a game where…", ready to paste into the standard generation pipeline.

This is exposed on the `/create` page as an "Upload a drawing" button. The flow:
1. User selects image → browser reads it as base64
2. POST to `/api/games/vision` → Claude Vision analyzes it
3. Response auto-fills the prompt textarea
4. User can edit before submitting

**Why this multimodality specifically:** It's the most compelling demo moment for a kids product — "draw your hero, we'll make the game." The implementation reuses the existing generation pipeline entirely; vision only adds the first step.

---

## LangSmith tracing

All Claude calls go through a `wrapAnthropic`-wrapped client (`langsmith/wrappers/anthropic`). The LangGraph invocation is wrapped with `traceable` under the name `game-generation`. This means every trace in LangSmith shows:

- One parent span: `game-generation`
- Child spans for each LangGraph node (loadPrompts, generateMeta, ragEnhance, etc.)
- Nested Claude call spans with token counts, latency, and model name
- Retry attempts visible as repeated `generateGame` → `validateHtml` pairs

Set `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` in `.env` to enable.

---

## Key technical decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Primary LLM | Claude Sonnet 4.6 | Best code generation quality for Phaser 3 at reasonable cost. Haiku tested first — game quality was too inconsistent. |
| Moderation LLM | Claude Haiku 4.5 | 10× cheaper than Sonnet, sufficient for binary allow/reject with a tight system prompt. Temperature=0 for determinism. |
| Orchestration | LangGraph | The retry loop (validate → regenerate) has conditional branching that would be tangled as plain async code. LangGraph makes the graph inspectable, traceable, and testable as units. |
| Vector DB | pgvector (Supabase) | Already running Postgres for games/prompts. ~50 chunks don't justify a dedicated vector DB. |
| Embedding model | text-embedding-3-small | Sufficient quality for short code chunks. 5× cheaper than large. No reranker — corpus is small enough that top-5 cosine similarity is accurate. |
| Storage | Cloudflare R2 | S3-compatible, cheap egress, works well for public HTML/PNG files. Games are served directly from R2 via public URL in the iframe. |
| Screenshots | Puppeteer | Needed to capture the actual rendered game canvas, not just the HTML. Runs after upload so the screenshot URL is the R2-hosted file, not localhost. |
| Temperature | 0.7 (generation) | A/B tested vs 1.0. See EVALS.md for results. |
| Max tokens | 32,000 | A complete Phaser 3 game with 3 scenes, physics, and game loop reliably needs 6,000–12,000 tokens. 32K gives headroom for complex prompts without truncation. |

---

## Cost per game

| Step | Model | Approx cost |
|---|---|---|
| Moderation | Haiku | ~$0.001 |
| Meta generation | Haiku | ~$0.001 |
| RAG embedding | text-embedding-3-small | ~$0.000 |
| Game generation | Sonnet 4.6 (32K out) | ~$0.10–0.15 |
| **Total** | | **~$0.10–0.15** |

Retry adds ~$0.10–0.15 per attempt. In practice retry rate is <15% after system prompt improvements.
