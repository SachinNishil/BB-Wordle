import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config';

// No sign-in, so no auth session to persist or refresh.
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // A short heartbeat notices a dead connection quickly (iPhones often keep a
      // socket that looks open after the app has been in the background).
      realtime: { params: { eventsPerSecond: 20 }, heartbeatIntervalMs: 12000 },
    })
  : null;
