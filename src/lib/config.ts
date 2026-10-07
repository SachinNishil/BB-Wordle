// Supabase connection settings come from environment variables, set in
// Vercel (Project > Settings > Environment Variables) or in a local .env file.
// Both values are safe to ship to the browser: the anon / publishable key can
// only call the functions in supabase/schema.sql, and those need the room key.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export { APP_VERSION } from './versions';

/** Unique per deploy (the Git commit on Vercel). Injected by vite.config.ts. */
export const BUILD_ID: string = __BUILD_ID__;
