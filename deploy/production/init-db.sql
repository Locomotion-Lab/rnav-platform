-- Runs only during initialization of a new empty named PG volume. No existing cluster is reset.
DO $roles$
BEGIN
  EXECUTE format('CREATE ROLE rnav_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', btrim(pg_read_file('/run/secrets/db_migrator_password')));
  EXECUTE format('CREATE ROLE rnav_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', btrim(pg_read_file('/run/secrets/db_app_password')));
END $roles$;
ALTER DATABASE rnav_platform OWNER TO rnav_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO rnav_migrator;
GRANT USAGE ON SCHEMA public TO rnav_app;
