import { createClient } from '@supabase/supabase-js';

// Don't throw at import time — let individual calls surface clear errors
export const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? '',
);
