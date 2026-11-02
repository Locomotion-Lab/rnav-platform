-- Migration 039 tightened the public-field CHECK but retained an obsolete default containing 'academic'.
-- Change only the default for future rows; existing consents/visibility are untouched.
ALTER TABLE user_profiles ALTER COLUMN public_fields
  SET DEFAULT ARRAY['name_zh','name_en','academic_stage','enrollment_year']::text[];
