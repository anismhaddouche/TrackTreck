-- Migration: Add quality_score and quality_details to tours table
-- Allows ranking, filtering, and persisting the tour completeness score (0 to 100)

ALTER TABLE tours ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT 0;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS quality_details jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tours_quality_score ON tours(quality_score DESC);
