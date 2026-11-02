-- Additive only: existing COS URLs, keys and files are retained.
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'cos'
    CHECK (storage_provider IN ('cos','local')),
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
