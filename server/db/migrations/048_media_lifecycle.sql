ALTER TABLE media_assets
  ADD COLUMN category text NOT NULL DEFAULT 'other' CHECK (category IN ('avatar', 'site', 'device', 'other')),
  ADD COLUMN auto_delete boolean NOT NULL DEFAULT false;

CREATE INDEX media_assets_auto_delete_due ON media_assets(recycled_at)
  WHERE auto_delete AND status='recycled';

-- This also handles legacy references stored as COS URLs and both API file URL forms.
CREATE FUNCTION rnav_media_refers(media media_assets, value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(position(media.id::text IN lower(value)) > 0
    OR position(NULLIF(media.url, '') IN value) > 0, false)
$$;

CREATE FUNCTION rnav_media_reference_count(media_id uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT
      (SELECT count(*) FROM storage_migration_journal WHERE storage_migration_journal.media_id=m.id)
      + (SELECT count(*) FROM user_profiles WHERE avatar_asset_id=m.id OR rnav_media_refers(m, personal_links::text))
      + (SELECT count(*) FROM research_items WHERE image_asset_id=m.id OR pdf_asset_id=m.id
        OR rnav_media_refers(m, image_src) OR rnav_media_refers(m, pdf_src))
      + (SELECT count(*) FROM research_item_links WHERE rnav_media_refers(m, href))
      + (SELECT count(*) FROM news_items WHERE image_asset_id=m.id OR rnav_media_refers(m, image_src) OR rnav_media_refers(m, link_href))
      + (SELECT count(*) FROM facility_items WHERE image_asset_id=m.id OR rnav_media_refers(m, image_src))
      + (SELECT count(*) FROM lab_asset_public_profiles WHERE image_asset_id=m.id)
      + (SELECT count(*) FROM lab_platform_public_profiles WHERE image_asset_id=m.id)
      + (SELECT count(*) FROM procurement_catalog_items WHERE image_asset_id=m.id)
      + (SELECT count(*) FROM team_members WHERE image_asset_id=m.id OR rnav_media_refers(m, image_src))
      + (SELECT count(*) FROM team_member_links WHERE rnav_media_refers(m, href))
      + (SELECT count(*) FROM contact_primary_channels WHERE rnav_media_refers(m, href))
      + (SELECT count(*) FROM contact_social_links WHERE rnav_media_refers(m, href))
      + (SELECT count(*) FROM page_content WHERE rnav_media_refers(m, content_json::text))
    FROM media_assets m WHERE m.id=$1
  ), 0)
$$;

UPDATE media_assets m SET category=CASE
  WHEN EXISTS(SELECT FROM user_profiles WHERE avatar_asset_id=m.id)
    OR EXISTS(SELECT FROM team_members WHERE image_asset_id=m.id OR rnav_media_refers(m, image_src)) THEN 'avatar'
  WHEN EXISTS(SELECT FROM lab_asset_public_profiles WHERE image_asset_id=m.id)
    OR EXISTS(SELECT FROM lab_platform_public_profiles WHERE image_asset_id=m.id) THEN 'device'
  WHEN rnav_media_reference_count(m.id)>0
    AND NOT EXISTS(SELECT FROM procurement_catalog_items WHERE image_asset_id=m.id) THEN 'site'
  ELSE 'other'
END;

-- Match only columns that changed. A producer can replace or reinsert references
-- within one transaction. Retirement sees the final set after all writes.
CREATE FUNCTION rnav_manage_media_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  before_row jsonb;
  after_row jsonb;
  field text;
  asset record;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;

  FOREACH field IN ARRAY TG_ARGV LOOP
    IF before_row -> field IS NOT DISTINCT FROM after_row -> field THEN CONTINUE; END IF;
    IF TG_WHEN = 'BEFORE' AND after_row ->> field IS NOT NULL THEN
      FOR asset IN
        SELECT m.id, m.status FROM media_assets m
        WHERE rnav_media_refers(m, after_row ->> field)
        ORDER BY m.id FOR SHARE
      LOOP
        IF asset.status <> 'active' THEN
          RAISE EXCEPTION 'Referenced media must be active'
            USING ERRCODE='23503', CONSTRAINT='active_media_assets';
        END IF;
      END LOOP;
    ELSIF TG_WHEN = 'AFTER' AND before_row ->> field IS NOT NULL THEN
      FOR asset IN
        SELECT m.id FROM media_assets m
        WHERE m.status='active' AND m.mime_type LIKE 'image/%'
          AND rnav_media_refers(m, before_row ->> field)
        ORDER BY m.id FOR UPDATE
      LOOP
        IF rnav_media_reference_count(asset.id)=0 THEN
          UPDATE media_assets SET status='recycled', auto_delete=true, recycled_at=now(), updated_at=now()
          WHERE id=asset.id;
          INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail)
            VALUES(NULL,'media.auto_recycle','media_asset',asset.id::text,
              jsonb_build_object('source', TG_TABLE_NAME, 'field', field));
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  config record;
BEGIN
  FOR config IN SELECT * FROM (VALUES
    ('user_profiles', '''avatar_asset_id'', ''personal_links'''),
    ('research_items', '''image_asset_id'', ''image_src'', ''pdf_asset_id'', ''pdf_src'''),
    ('research_item_links', '''href'''),
    ('news_items', '''image_asset_id'', ''image_src'', ''link_href'''),
    ('facility_items', '''image_asset_id'', ''image_src'''),
    ('lab_asset_public_profiles', '''image_asset_id'''),
    ('lab_platform_public_profiles', '''image_asset_id'''),
    ('contact_primary_channels', '''href'''),
    ('contact_social_links', '''href'''),
    ('page_content', '''content_json''')
  ) AS tracked(table_name, field_args)
  LOOP
    EXECUTE format('CREATE TRIGGER media_validate BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION rnav_manage_media_references(%s)', config.table_name, config.field_args);
    EXECUTE format('CREATE CONSTRAINT TRIGGER media_retire AFTER UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rnav_manage_media_references(%s)', config.table_name, config.field_args);
  END LOOP;
END;
$$;
