// Centralized read of public env vars consumed by the frontend.
// Never read or expose the Supabase service role key here.

const rawWebhookUrl = (import.meta.env.VITE_N8N_INGESTION_WEBHOOK_URL ?? "").trim();

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  supabaseStorageBucket:
    import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? "travel-offer-assets",
  pipelineWebhookUrl: rawWebhookUrl,
};

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!env.supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");
  return missing;
}

// Returns null if the configured webhook URL passes basic sanity checks,
// otherwise a short human-readable reason. Catches the most common deploy
// regressions: empty value, leftover localhost/sslip from dev, and URLs that
// forget the n8n /webhook/ prefix (the production-test "/webhook-test/" path
// only works while the workflow is in test mode and 404s otherwise).
export function describeWebhookConfigIssue(): string | null {
  const url = env.pipelineWebhookUrl;
  if (!url) return "VITE_N8N_INGESTION_WEBHOOK_URL est vide.";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return "VITE_N8N_INGESTION_WEBHOOK_URL pointe vers localhost.";
    }
    if (parsed.hostname.endsWith(".sslip.io")) {
      return "VITE_N8N_INGESTION_WEBHOOK_URL utilise encore sslip.io (déprécié).";
    }
    if (!parsed.pathname.includes("/webhook/")) {
      return "VITE_N8N_INGESTION_WEBHOOK_URL ne contient pas /webhook/ — vérifier le chemin n8n.";
    }
    return null;
  } catch {
    return "VITE_N8N_INGESTION_WEBHOOK_URL n'est pas une URL valide.";
  }
}
