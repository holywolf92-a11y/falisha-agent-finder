-- ============================================================================
-- Falisha Agent Finder — Phase 4 CRM
-- Per-agency outreach pipeline stage + notes. ADDITIVE ONLY — safe to run in the
-- Supabase SQL editor alongside everything else.
-- ============================================================================

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS outreach_stage text NOT NULL DEFAULT 'new'
    CHECK (outreach_stage IN ('new','contacted','replied','interested','not_interested','converted')),
  ADD COLUMN IF NOT EXISTS outreach_notes text,
  ADD COLUMN IF NOT EXISTS outreach_stage_at timestamptz;

CREATE INDEX IF NOT EXISTS agencies_outreach_stage_idx ON agencies (outreach_stage);

COMMENT ON COLUMN agencies.outreach_stage IS 'CRM pipeline: new|contacted|replied|interested|not_interested|converted.';
