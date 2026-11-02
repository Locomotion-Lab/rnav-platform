import pg from 'pg';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{await p.query(`BEGIN;
GRANT USAGE ON SCHEMA public TO rnav_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO rnav_app;
GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO rnav_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rnav_migrator IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO rnav_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rnav_migrator IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO rnav_app;
REVOKE INSERT,UPDATE,DELETE ON schema_migrations,permissions,permission_templates,permission_template_permissions,storage_migration_journal FROM rnav_app;
DO $archive$ DECLARE item record; BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'procurement_%' OR tablename LIKE 'device_%' OR tablename IN ('devices','monitor_service_status')) LOOP
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON TABLE %I FROM rnav_app',item.tablename);
 END LOOP;
END $archive$;
COMMIT;`);console.log('Application DML grants installed; migration DDL remains separate');}finally{await p.end();}
