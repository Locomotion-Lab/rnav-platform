#!/usr/bin/env python3
"""Explicitly read-only aggregate audit via existing SSH alias; no row export."""
import subprocess, json, pathlib
SQL = """BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object('kind','database','bytes',pg_database_size(current_database()),'foreignKeys',(SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace));
SELECT format('SELECT jsonb_build_object(''kind'',''table'',''name'',%L,''count'',count(*)) FROM %I.%I;',tablename,schemaname,tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\\gexec
SELECT jsonb_build_object('kind','migrations','items',(SELECT jsonb_agg(x) FROM (SELECT version,checksum FROM schema_migrations ORDER BY version)x));
SELECT jsonb_build_object('kind','media','count',count(*),'bytes',sum(size_bytes),'distinctObjects',count(DISTINCT object_key),'missingHash',count(*)FILTER(WHERE checksum_sha256 IS NULL OR checksum_sha256=''),'active',count(*)FILTER(WHERE status='active'),'largest',max(size_bytes)) FROM media_assets;
SELECT jsonb_build_object('kind','references','avatars',(SELECT count(*) FROM user_profiles WHERE avatar_asset_id IS NOT NULL),'assetPublic',(SELECT count(*) FROM lab_asset_public_profiles WHERE image_asset_id IS NOT NULL),'platformPublic',(SELECT count(*) FROM lab_platform_public_profiles WHERE image_asset_id IS NOT NULL),'researchPdfs',(SELECT count(*) FROM research_items WHERE pdf_asset_id IS NOT NULL),'retiredCatalog',(SELECT count(*) FROM procurement_catalog_items WHERE image_asset_id IS NOT NULL),'assetProcurementLinks',(SELECT count(*) FROM lab_assets WHERE source_procurement_request_id IS NOT NULL));
COMMIT;
"""
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','rnav','sudo -n -u postgres psql -XqAt -d rnav_platform -v ON_ERROR_STOP=1'], input=SQL,text=True,capture_output=True,check=True)
items=[json.loads(line) for line in r.stdout.splitlines() if line.startswith('{')]
p=pathlib.Path('docs/phase3/production-inventory.json')
p.write_text(json.dumps({'date':'2026-11-02','scope':'Read-only schema/aggregates only; no business rows or credentials','items':items},indent=2)+'\n')
print('Aggregate metadata recorded:',sum(x['kind']=='table' for x in items),'tables')
