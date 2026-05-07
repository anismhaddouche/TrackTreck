// Centralized read of public env vars consumed by the frontend.
// Never read or expose the Supabase service role key here.

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  supabaseStorageBucket:
    import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? "travel-offer-assets",
};

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!env.supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");
  return missing;
}
