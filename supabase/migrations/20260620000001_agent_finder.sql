-- ============================================================================
-- Falisha Agent Finder — initial schema
-- New tables for the Google Maps agency discovery + enrichment + outreach
-- pipeline. Sits alongside the existing recruiter_companies (job-board sweep)
-- in the same Supabase project.
-- All tables are service-role-only (RLS enabled, no policies).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Shared updated_at trigger function ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- agencies — one row per Google Maps profile
-- ============================================================================
CREATE TABLE IF NOT EXISTS agencies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id       text NOT NULL UNIQUE,
  name                  text NOT NULL,
  name_normalized       text NOT NULL,

  country_code          text NOT NULL,
  country_name          text,
  city                  text,
  address               text,
  latitude              double precision,
  longitude             double precision,
  postal_code           text,

  category              text,
  google_categories     text[] NOT NULL DEFAULT '{}',
  website               text,

  rating                numeric(2,1),
  review_count          integer NOT NULL DEFAULT 0,
  price_level           smallint,
  business_status       text,

  first_sweep_id        uuid,
  last_sweep_id         uuid,
  last_sweep_at         timestamptz,

  -- Enrichment state machine
  enrichment_status     text NOT NULL DEFAULT 'not_enriched'
    CHECK (enrichment_status IN ('not_enriched','queued','in_progress','enriched','no_data','failed')),
  enrichment_queued_at  timestamptz,
  enrichment_started_at timestamptz,
  enrichment_completed_at timestamptz,
  enrichment_attempts   smallint NOT NULL DEFAULT 0 CHECK (enrichment_attempts <= 5),
  enrichment_error      text,

  -- Optional merge into the existing job-board company entity
  recruiter_company_id  uuid,

  -- Raw blob from Maps for audit; nullable so it can be pruned later
  raw                   jsonb,
  raw_summary           jsonb,

  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agencies_country_idx       ON agencies (country_code);
CREATE INDEX IF NOT EXISTS agencies_category_idx      ON agencies (category);
CREATE INDEX IF NOT EXISTS agencies_rating_idx        ON agencies (rating DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS agencies_enrichment_idx    ON agencies (enrichment_status);
CREATE INDEX IF NOT EXISTS agencies_last_sweep_idx    ON agencies (last_sweep_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS agencies_alive_idx         ON agencies (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS agencies_name_trgm_idx     ON agencies USING gin (lower(name) gin_trgm_ops);

CREATE TRIGGER agencies_set_updated_at
  BEFORE UPDATE ON agencies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- agency_emails — 1:N
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email           text NOT NULL,
  email_normalized text NOT NULL,
  source          text NOT NULL CHECK (source IN ('website_scrape','snov','hunter','manual','google_maps','pattern_guess')),
  source_url      text,
  confidence      smallint NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  verified        boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, email_normalized)
);

CREATE INDEX IF NOT EXISTS agency_emails_agency_idx ON agency_emails (agency_id);
CREATE INDEX IF NOT EXISTS agency_emails_email_idx  ON agency_emails (email_normalized);

CREATE TRIGGER agency_emails_set_updated_at
  BEFORE UPDATE ON agency_emails FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- agency_phones — 1:N
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_phones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  phone           text NOT NULL,
  phone_normalized text NOT NULL,
  phone_type      text NOT NULL DEFAULT 'main'
    CHECK (phone_type IN ('main','whatsapp','mobile','fax','tollfree')),
  source          text NOT NULL CHECK (source IN ('google_maps','website_scrape','manual')),
  source_url      text,
  verified        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, phone_normalized, phone_type)
);

CREATE INDEX IF NOT EXISTS agency_phones_agency_idx ON agency_phones (agency_id);

CREATE TRIGGER agency_phones_set_updated_at
  BEFORE UPDATE ON agency_phones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- agency_socials — 1:N
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_socials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('linkedin','facebook','instagram','twitter','tiktok','youtube','whatsapp','website','other')),
  url             text NOT NULL,
  handle          text,
  source          text NOT NULL CHECK (source IN ('website_scrape','manual','google_maps')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, platform, url)
);

CREATE INDEX IF NOT EXISTS agency_socials_agency_idx ON agency_socials (agency_id);

-- ============================================================================
-- agency_reviews — 1:N (Google Maps reviews, useful for prioritisation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  google_review_id text,
  author_name      text,
  rating           smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text             text,
  language         text,
  posted_at        timestamptz,
  scraped_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_reviews_agency_idx  ON agency_reviews (agency_id);
CREATE INDEX IF NOT EXISTS agency_reviews_posted_idx  ON agency_reviews (posted_at DESC NULLS LAST);

-- ============================================================================
-- sweeps — one row per sweep run
-- ============================================================================
CREATE TABLE IF NOT EXISTS sweeps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','complete','failed','cancelled')),
  cities           text[] NOT NULL,
  keywords         text[] NOT NULL,
  languages        text[] NOT NULL DEFAULT '{"en"}',
  started_at       timestamptz,
  finished_at      timestamptz,
  duration_ms      integer,
  total_queries    integer NOT NULL DEFAULT 0,
  total_results    integer NOT NULL DEFAULT 0,
  new_agencies     integer NOT NULL DEFAULT 0,
  api_cost_cents   integer NOT NULL DEFAULT 0,
  error_message    text,
  triggered_by     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sweeps_status_idx     ON sweeps (status);
CREATE INDEX IF NOT EXISTS sweeps_created_idx    ON sweeps (created_at DESC);

CREATE TRIGGER sweeps_set_updated_at
  BEFORE UPDATE ON sweeps FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- sweep_queries — per-query audit log inside a sweep
-- ============================================================================
CREATE TABLE IF NOT EXISTS sweep_queries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id           uuid NOT NULL REFERENCES sweeps(id) ON DELETE CASCADE,
  city               text NOT NULL,
  keyword            text NOT NULL,
  language           text NOT NULL DEFAULT 'en',
  region_code        text,
  page_index         smallint NOT NULL DEFAULT 0,
  page_token         text,
  results_count      integer NOT NULL DEFAULT 0,
  new_agencies       integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','rate_limited')),
  error_message      text,
  duration_ms        integer,
  ran_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sweep_queries_sweep_idx ON sweep_queries (sweep_id, ran_at);
CREATE INDEX IF NOT EXISTS sweep_queries_ran_idx   ON sweep_queries (ran_at DESC);

-- Now that sweeps exists, add the FK from agencies.first_sweep_id / last_sweep_id
ALTER TABLE agencies
  ADD CONSTRAINT agencies_first_sweep_fk FOREIGN KEY (first_sweep_id) REFERENCES sweeps(id) ON DELETE SET NULL,
  ADD CONSTRAINT agencies_last_sweep_fk  FOREIGN KEY (last_sweep_id)  REFERENCES sweeps(id) ON DELETE SET NULL;

-- ============================================================================
-- agency_outreach — unified outreach log (per-agency, append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_outreach (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,

  channel             text NOT NULL CHECK (channel IN ('email','whatsapp','sms','linkedin','phone','manual')),
  direction           text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  template_id         text,
  subject             text,
  body                text,

  to_email            text,
  to_phone            text,
  agency_email_id     uuid REFERENCES agency_emails(id) ON DELETE SET NULL,
  agency_phone_id     uuid REFERENCES agency_phones(id) ON DELETE SET NULL,

  provider            text,
  provider_message_id text,

  status              text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','read','replied','bounced','failed','cancelled')),
  status_reason       text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  replied_at          timestamptz,
  bounced_at          timestamptz,
  failed_at           timestamptz,

  replied_to_id       uuid REFERENCES agency_outreach(id) ON DELETE SET NULL,

  triggered_by        text,
  notes               text,
  raw                 jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_outreach_agency_idx     ON agency_outreach (agency_id);
CREATE INDEX IF NOT EXISTS agency_outreach_channel_idx    ON agency_outreach (channel);
CREATE INDEX IF NOT EXISTS agency_outreach_status_idx     ON agency_outreach (status);
CREATE INDEX IF NOT EXISTS agency_outreach_sent_idx       ON agency_outreach (sent_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS agency_outreach_provider_msg_idx
  ON agency_outreach (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TRIGGER agency_outreach_set_updated_at
  BEFORE UPDATE ON agency_outreach FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- app_settings — encrypted runtime config / API keys (AES-256-GCM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key                 text PRIMARY KEY,
  value_ciphertext    bytea,
  value_plaintext     jsonb,
  iv                  bytea,
  auth_tag            bytea,
  key_version         smallint NOT NULL DEFAULT 1,
  is_secret           boolean NOT NULL DEFAULT true,
  value_type          text NOT NULL DEFAULT 'string'
    CHECK (value_type IN ('string','int','bool','json')),
  description         text,
  last_validated_at   timestamptz,
  last_validation_status text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- app_settings_audit — every change logged with HMAC of values, not raw
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings_audit (
  id              bigserial PRIMARY KEY,
  key             text NOT NULL,
  action          text NOT NULL CHECK (action IN ('create','update','delete','reveal','validate')),
  old_value_hmac  text,
  new_value_hmac  text,
  actor_email     text,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_settings_audit_key_idx ON app_settings_audit (key, created_at DESC);
CREATE INDEX IF NOT EXISTS app_settings_audit_actor_idx ON app_settings_audit (actor_email, created_at DESC);

-- ============================================================================
-- Postgres NOTIFY trigger so worker processes can invalidate their setting
-- cache within ~1s of an admin edit (instead of waiting on a TTL).
-- ============================================================================
CREATE OR REPLACE FUNCTION app_settings_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('app_settings_changed', NEW.key);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_settings_notify_trg
  AFTER INSERT OR UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION app_settings_notify();

-- ============================================================================
-- RLS — service-role-only across the board (backend uses service key, bypasses)
-- ============================================================================
ALTER TABLE agencies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_emails       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_phones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_socials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sweeps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sweep_queries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_outreach     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings_audit  ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helpful comments visible in Supabase studio
-- ============================================================================
COMMENT ON TABLE agencies            IS 'Discovered Gulf recruitment agencies from Google Maps. Deduped on google_place_id.';
COMMENT ON TABLE sweeps              IS 'One row per sweep run (cities + keywords + timestamp).';
COMMENT ON TABLE sweep_queries       IS 'Per-query log inside a sweep — one row per provider call / page.';
COMMENT ON TABLE agency_emails       IS '1:N — multiple emails per agency. Source + confidence + verified.';
COMMENT ON TABLE agency_phones       IS '1:N — phones per agency, typed (main/whatsapp/mobile/fax).';
COMMENT ON TABLE agency_socials      IS '1:N — linkedin/facebook/instagram/twitter/tiktok/youtube/website.';
COMMENT ON TABLE agency_reviews      IS 'Google Maps reviews per agency, for prioritisation.';
COMMENT ON TABLE agency_outreach     IS 'Unified outreach log per agency (email/whatsapp/linkedin/phone).';
COMMENT ON TABLE app_settings        IS 'AES-256-GCM-encrypted runtime settings (API keys, sweep defaults).';
COMMENT ON TABLE app_settings_audit  IS 'Append-only audit of every settings change (HMAC of values, never raw).';
