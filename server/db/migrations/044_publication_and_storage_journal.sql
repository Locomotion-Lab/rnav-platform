INSERT INTO permissions(key,name_zh,name_en,description_zh,description_en,category,is_advanced)
VALUES('site.publish','公开内容发布','Publish public content','审核和签署公开发布包','Review and sign public releases','site',true)
ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS storage_migration_journal (
  media_id uuid PRIMARY KEY REFERENCES media_assets(id) ON DELETE RESTRICT,
  old_object_key text NOT NULL, old_url text NOT NULL, new_object_key text NOT NULL,
  checksum_sha256 text NOT NULL, migrated_at timestamptz NOT NULL DEFAULT now()
);
