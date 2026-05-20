# Skill: game-concept

## Description
Generate a structured Phaser 3 game concept from a vague or high-level game idea. Produces a complete spec that can be fed directly to the KidsMakeGames generation pipeline.

## Triggers
- User describes a vague game idea ("make a fun game about cats")
- User asks "what game should I make about X"
- User wants to expand a one-word prompt into a full game concept
- User asks `/game-concept <idea>`

## When this Skill is better than a plain prompt
A plain prompt sends the raw idea to Claude Sonnet which must simultaneously invent AND code the game. This Skill separates concept generation from code generation — producing a structured spec first — which results in more coherent game designs and fewer retries.

## Behavior
When triggered, generate a structured game concept using this exact output format:

```
GAME CONCEPT
────────────
Title:        [Catchy kid-friendly title, max 40 chars]
Tagline:      [One sentence, max 80 chars]

MECHANICS
─────────
Player:       [What the player controls and how]
Objective:    [Win condition — collect X / survive Y seconds / reach the end]
Controls:     [Arrow keys / WASD / SPACE / mouse — keep to ≤2 input types]
Enemies:      [Optional — what challenges the player]
Collectibles: [Optional — what the player picks up]

PHASER 3 APPROACH
─────────────────
Scene flow:   MenuScene → GameScene → EndScene
Physics:      [arcade gravity settings]
Textures:     [List 3-5 key sprites and what Phaser graphics API to use]
Win trigger:  [Code-level: e.g. score >= 10, timer === 0, overlap with exit]
Lose trigger: [Code-level: e.g. lives === 0, overlap with enemy]

PROMPT FOR GENERATION
──────────────────────
[A single rich paragraph (50-100 words) ready to paste into KidsMakeGames.
 Includes: theme, mechanics, win/lose conditions, visual style, player age.]
```

## Rules
- Keep everything simple and achievable in a single 800×600 Phaser 3 game
- Target age 8-12: bright colors, clear mechanics, winnable in under 90 seconds
- Textures must only use valid Phaser 3 Graphics methods: fillRect, fillCircle, fillTriangle, fillRoundedRect, fillPoints
- Never suggest external assets, image URLs, or audio files
- Never suggest more than 3 scene types
- The "Prompt for Generation" section should be self-contained and usable directly
