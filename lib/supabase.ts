import { createClient } from '@supabase/supabase-js';

if (!process.env.CE_SUPABASE_URL) throw new Error('CE_SUPABASE_URL is not set');
if (!process.env.CE_SUPABASE_SERVICE_ROLE_KEY) throw new Error('CE_SUPABASE_SERVICE_ROLE_KEY is not set');

// Server-side only — uses service role key, bypasses RLS.
// Never import this in client components.
export const supabaseAdmin = createClient(
  process.env.CE_SUPABASE_URL,
  process.env.CE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
