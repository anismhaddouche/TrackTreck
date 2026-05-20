-- Adds a JSONB array of commissions on `tours`, replacing the scalar
-- `commission_amount` as the source of truth. The legacy column stays in
-- place (read-only from the admin) so any historical consumer keeps working.
--
-- Backfill: any existing non-null `commission_amount` becomes a single-row
-- array `[{ "label": "Commission", "amount": <value> }]` so the admin keeps
-- showing the same data on load.
--
-- Apply manually (Studio / `supabase db push`); the front-end has a fallback
-- so it works even before this runs.

ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS commissions jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.tours
SET commissions = jsonb_build_array(
  jsonb_build_object('label', 'Commission', 'amount', commission_amount)
)
WHERE commission_amount IS NOT NULL
  AND (commissions IS NULL OR commissions = '[]'::jsonb);
