# EVALS.md — KidsMakeGames Evaluation Results

Last run: 2026-05-20_06-29

## Overview

KidsMakeGames generates Phaser 3 browser games from natural language prompts. We evaluate two core quality dimensions:

1. **Validity Rate** — Can the generated game be delivered without crashes? (automated)
2. **Playability Score** — Is the game actually fun and well-designed for kids? (LLM-as-judge)

## Golden Dataset

**Total entries:** 28 evaluatable (33 total — 3 reject + 2 sanitizable excluded from generation). Last quick run scored 5 entries; full run scores all 28.
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
- Valid HTML starting with `<!DOCTYPE html>`
- Phaser CDN script tag present

**Result:** 5/5 = **100.0%**

### By Category
| Category | Valid | Total | Rate |
|---|---|---|---|
| simple | 5 | 5 | 100% |

## Metric 2: Playability Score (LLM-as-Judge)

**Definition:** Claude Haiku evaluates each valid game on a 1-5 rubric:
- 1: Broken/unplayable
- 2: Barely playable (missing score, win condition unclear)
- 3: Playable but weak
- 4: Good (clear mechanics, kid-friendly)
- 5: Excellent (all mechanics work, fun, matches prompt)

**Result:** **2.40/5** average across 5 scored games

## A/B Experiment: Temperature 0.7 vs 1.0

**Hypothesis:** Higher temperature (1.0) produces more creative/varied games but may have higher failure rates.

**Design:**
- Variant A (temperature=0.7): deterministic, consistent code generation
- Variant B (temperature=1.0): more creative, potentially more varied gameplay

**Results:**

| Metric | Variant A (T=0.7) | Variant B (T=1.0) |
|---|---|---|
| Validity Rate | 100.0% | 100.0% |
| Avg Playability | 2.33/5 | 2.50/5 |

**Conclusion:** Both variants achieve 100% validity — the production system prompt is robust enough that temperature has no measurable effect on structural correctness. We choose **temperature=0.7** in production for more deterministic, reproducible output.

## Performance

Average generation time: **79.5s** per game (Claude Sonnet 4.6, streaming, 32K max tokens)

## How to Run Evals

```bash
cd evals
npm install
npx tsx run-evals.ts          # Full run (~28 games, ~44 min)
npx tsx run-evals.ts --quick  # First 5 entries only (~7 min)
npx tsx run-evals.ts --ab-only  # Skip LLM scoring (faster)
npx tsx run-evals.ts --category simple  # One category only
```

Results are written to `evals/results-YYYY-MM-DD_HH-MM.json` and this file is auto-updated.
