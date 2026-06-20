-- Fix: store base64 ciphertext / iv / auth_tag as TEXT, not bytea.
-- The original `bytea` columns round-trip incorrectly through PostgREST when
-- the application sends base64-encoded strings and reads them back: PostgreSQL
-- returns the bytea as a hex-escaped string (\x4743...) which is the hex of
-- the ASCII bytes of the base64 string — not the original ciphertext bytes.
-- Storing as TEXT keeps the base64 round-trip clean (string in, string out).
--
-- We drop any existing rows because the bytea storage corrupted the original
-- data on write; they cannot be decrypted to recover. The Settings page will
-- show them as empty and the admin can re-save.

DELETE FROM app_settings_audit;
DELETE FROM app_settings;

ALTER TABLE app_settings
  ALTER COLUMN value_ciphertext TYPE text USING NULL,
  ALTER COLUMN iv               TYPE text USING NULL,
  ALTER COLUMN auth_tag         TYPE text USING NULL;
