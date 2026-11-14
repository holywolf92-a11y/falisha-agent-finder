-- Agency relevance: is this Google Maps result actually a recruitment agency?
--
-- ADDITIVE ONLY. Safe to run twice. Run in the Supabase SQL editor.
-- Nothing is deleted: non-agencies are only HIDDEN from the default Agencies
-- view and from bulk actions, and can be shown or restored at any time.
--
--   relevance          'recruitment' (confirmed agency) · 'review' (unclear —
--                      still shown) · 'not_recruitment' (hidden) · NULL = not
--                      classified yet (shown)
--   relevance_source   'auto' (classifier) · 'manual' (you set it in the app —
--                      the classifier never overrides a manual verdict)

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS relevance            text,
  ADD COLUMN IF NOT EXISTS relevance_reason     text,
  ADD COLUMN IF NOT EXISTS relevance_source     text,
  ADD COLUMN IF NOT EXISTS relevance_checked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agencies_relevance_check') THEN
    ALTER TABLE agencies ADD CONSTRAINT agencies_relevance_check
      CHECK (relevance IS NULL OR relevance IN ('recruitment', 'review', 'not_recruitment'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agencies_relevance_source_check') THEN
    ALTER TABLE agencies ADD CONSTRAINT agencies_relevance_source_check
      CHECK (relevance_source IS NULL OR relevance_source IN ('auto', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agencies_relevance_idx ON agencies (relevance);
