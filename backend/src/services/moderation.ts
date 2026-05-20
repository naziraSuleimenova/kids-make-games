import Anthropic from '@anthropic-ai/sdk';
import { ModerationResult } from '../types';

const client = new Anthropic();

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above|prior)\s+instructions?/i,
  /system\s+prompt/i,
  /jailbreak/i,
  /\bDAN\b/,
  /<script/i,
  /javascript:/i,
  /prompt\s+injection/i,
];

const ESCALATION_WORDS = [
  'kill', 'shoot', 'blood', 'gore', 'death', 'die', 'dead',
  'weapon', 'gun', 'knife', 'bomb', 'sex', 'naked', 'drug',
];

function patternCheck(prompt: string, history: string[]): { pass: boolean; reason: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      return { pass: false, reason: 'Prompt injection attempt detected.' };
    }
  }

  const allPrompts = [...history, prompt];
  const escalationCount = allPrompts.reduce((count, p) => {
    return count + ESCALATION_WORDS.filter(w => p.toLowerCase().includes(w)).length;
  }, 0);

  if (escalationCount >= 3) {
    return { pass: false, reason: 'Too many inappropriate words across prompt history.' };
  }

  return { pass: true, reason: '' };
}

export function isGibberish(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 10) return true;
  const words = trimmed.split(/\s+/);
  const meaningfulWords = words.filter(w => w.length >= 3);
  return meaningfulWords.length === 0;
}

const MODERATION_SYSTEM = `You are a content moderator for a kids' game creation platform designed for children ages 4–12.
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
- "battle monsters" → "befriend monsters"

Respond with ONLY valid JSON, no markdown:
{"allowed": true|false, "reason": "short explanation if rejected, empty string if allowed", "sanitized_prompt": "cleaned prompt if allowed, empty string if rejected", "was_sanitized": true|false}`;

export async function moderatePrompt(
  prompt: string,
  history: string[] = [],
): Promise<ModerationResult> {
  if (isGibberish(prompt)) {
    return { allowed: false, reason: 'Prompt is too short or unclear.', sanitized_prompt: '', was_sanitized: false };
  }

  const patternResult = patternCheck(prompt, history);
  if (!patternResult.pass) {
    return { allowed: false, reason: patternResult.reason, sanitized_prompt: '', was_sanitized: false };
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    temperature: 0,
    system: MODERATION_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (message.content[0] as { type: 'text'; text: string }).text.trim();

  try {
    return JSON.parse(text) as ModerationResult;
  } catch {
    // If Claude returned malformed JSON, default to allowed to avoid blocking valid prompts
    return { allowed: true, reason: '', sanitized_prompt: prompt, was_sanitized: false };
  }
}
