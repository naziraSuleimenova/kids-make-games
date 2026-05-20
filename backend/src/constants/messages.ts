export const MESSAGES = {
  RATE_LIMIT: "Whoa, you're making games super fast! Take a short break and come back 🎮",
  PROMPT_TOO_SHORT: 'Tell us more about your game! At least 10 characters please.',
  PROMPT_TOO_LONG: 'That description is a bit long. Keep it under 240 characters!',
  CONTENT_REJECTED: "That idea isn't quite right for our games. Try something fun like animals, space, or puzzles!",
  MAX_PROMPTS: "You've refined this game 10 times — try starting a new one!",
  GENERATION_FAILED: 'The game wizard had trouble with that one. Try a slightly different idea!',
  GAME_NOT_FOUND: "That game doesn't exist (yet)!",
  GAME_STILL_GENERATING: 'This game is still being created. Please wait!',
  NOT_A_DRAFT: 'Only draft games can be published.',
  SERVER_ERROR: 'Something went wrong on our end. Try again in a moment!',
} as const;
