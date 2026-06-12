import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  _client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false },
  });
  return _client;
}

export const STORAGE_BUCKET = env.supabaseStorageBucket || "travel-offer-assets";
