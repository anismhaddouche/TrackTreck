-- Table d'empreintes numériques pour la déduplication en amont du pipeline d'ingestion WhatsApp
CREATE TABLE IF NOT EXISTS public.ingestion_hashes (
  id bigint generated always as identity primary key,
  content_hash text not null unique,
  media_type text not null check (media_type in ('image', 'pdf', 'text')),
  whatsapp_message_id text,
  sender_jid text,
  caption_snippet text,
  file_size_bytes bigint,
  tour_id bigint references public.tours(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Index pour une recherche rapide en O(1)
CREATE INDEX IF NOT EXISTS idx_ingestion_hashes_content_hash 
  ON public.ingestion_hashes(content_hash);

COMMENT ON TABLE public.ingestion_hashes IS 'Empreintes SHA-256 (médias + textes) pour empêcher la ré-ingestion et le parsing LlamaParse redondant.';
