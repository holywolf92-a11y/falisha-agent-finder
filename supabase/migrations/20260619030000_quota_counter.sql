-- Tracks Places API usage per month so the app can self-throttle below the
-- free tier (5,000 Text Search Pro + 1,000 Place Details Enterprise per month).
-- Period key is YYYY-MM so the row count stays trivial and the next-month
-- reset is implicit — a new period_key row appears on the 1st.

CREATE TABLE IF NOT EXISTS places_api_usage_counter (
  api_method  text         NOT NULL,
  period_key  text         NOT NULL,        -- e.g. '2026-06'
  count       integer      NOT NULL DEFAULT 0,
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (api_method, period_key),
  CONSTRAINT places_api_usage_counter_method_check
    CHECK (api_method IN ('text_search', 'place_details'))
);

CREATE INDEX IF NOT EXISTS places_api_usage_counter_period_idx
  ON places_api_usage_counter (period_key);

-- Atomic increment RPC so concurrent enrichment calls don't double-count when
-- read-modify-write races. SECURITY DEFINER so service role can call it.
CREATE OR REPLACE FUNCTION places_api_usage_increment(p_method text, p_period text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO places_api_usage_counter (api_method, period_key, count)
  VALUES (p_method, p_period, 1)
  ON CONFLICT (api_method, period_key) DO UPDATE
  SET count      = places_api_usage_counter.count + 1,
      updated_at = now()
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

ALTER TABLE places_api_usage_counter ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE places_api_usage_counter IS
  'Per-month counter for Places API calls. Used by app-layer quota guard so we self-throttle below the free monthly tier (Text Search Pro 5k, Place Details Enterprise 1k).';
