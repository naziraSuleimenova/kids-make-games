import rateLimit from 'express-rate-limit';
import { MESSAGES } from '../constants/messages';

export const gameCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: MESSAGES.RATE_LIMIT },
  standardHeaders: true,
  legacyHeaders: false,
});
