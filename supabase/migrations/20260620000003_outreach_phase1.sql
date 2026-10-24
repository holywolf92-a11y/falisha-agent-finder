-- ============================================================================
-- Falisha Agent Finder — Phase 1 outreach
-- WhatsApp reachability + partner-fit score + send dedup / dead-number memory.
-- ADDITIVE ONLY (ADD COLUMN IF NOT EXISTS). No DROPs, no ALTERs to existing
-- columns. Safe to apply via the Supabase SQL editor alongside everything else.
-- ============================================================================

ALTER TABLE agencies
  -- Partner-fit score 0-100 (computed by the scorer; drives sort + high/med/low).
  ADD COLUMN IF NOT EXISTS score                 smallint,
  ADD COLUMN IF NOT EXISTS score_tier            text
    CHECK (score_tier IN ('high','medium','low')),

  -- Best WhatsApp-reachable number for this agency (E.164 digits, no '+'),
  -- resolved by "Find WhatsApp". Null = no reachable WhatsApp number known.
  ADD COLUMN IF NOT EXISTS wa_phone              text,
  -- Line type of the primary phone (drives the mobile/landline contactable
  -- filters — a landline can never receive a WhatsApp template).
  ADD COLUMN IF NOT EXISTS primary_phone_type    text
    CHECK (primary_phone_type IN ('mobile','landline','unknown')),
  ADD COLUMN IF NOT EXISTS wa_checked_at         timestamptz,

  -- Outreach memory: dedup recent sends + permanently skip dead numbers.
  ADD COLUMN IF NOT EXISTS last_template_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS template_send_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wa_undeliverable_at   timestamptz;

CREATE INDEX IF NOT EXISTS agencies_score_idx
  ON agencies (score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS agencies_wa_phone_idx
  ON agencies (wa_phone) WHERE wa_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS agencies_primary_phone_type_idx
  ON agencies (primary_phone_type);
CREATE INDEX IF NOT EXISTS agencies_last_template_sent_idx
  ON agencies (last_template_sent_at DESC NULLS LAST);

COMMENT ON COLUMN agencies.score              IS 'Partner-fit score 0-100 (see scoreService).';
COMMENT ON COLUMN agencies.wa_phone           IS 'Best WhatsApp-reachable number, E.164 digits (no +).';
COMMENT ON COLUMN agencies.primary_phone_type IS 'mobile|landline|unknown — line type of the primary phone.';
COMMENT ON COLUMN agencies.wa_undeliverable_at IS 'Set when Meta reports the number is not on WhatsApp (131026) — excluded from future sends.';
