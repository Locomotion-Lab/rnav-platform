import { z } from "zod";

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());
const optionalString = z.preprocess((value) => value === "" ? undefined : value, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4090),
  PUBLIC_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(32),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  PUBLICATION_ROOT: z.string().default("./data/publications"),
  PUBLICATION_SIGNING_KEY_FILE: optionalString,
  GATEWAY_TOKEN: optionalString,
  REQUIRE_GATEWAY_TOKEN: z.enum(["true","false"]).default("false"),
  BACKEND_WRITE_ENABLED: z.enum(["true","false"]).default("true"),
  STORAGE_PROVIDER: z.enum(["local", "cos"]).default("cos"),
  STORAGE_ROOT: z.string().min(1).default("./data/private-media"),
  COS_SECRET_ID: z.string().optional(), COS_SECRET_KEY: z.string().optional(), COS_REGION: z.string().optional(),
  COS_BUCKET: z.string().optional(), COS_PUBLIC_BASE_URL: optionalUrl, COS_PATH_PREFIX: z.string().default("rnav"),
  MEDIA_MAX_UPLOAD_BYTES: z.coerce.number().int().min(1).max(100 * 1024 * 1024).default(20 * 1024 * 1024),
  OPENALEX_API_KEY: optionalString,
  SCHOLARLY_SYNC_CONTACT_EMAIL: z.preprocess((value) => value === "" ? undefined : value, z.string().email().optional()),
  SCHOLARLY_SYNC_ENABLED: z.enum(["true", "false"]).default("false"),
  SCHOLARLY_SYNC_OPENALEX_BASE_URL: z.string().url().default("https://api.openalex.org"),
  SCHOLARLY_SYNC_CROSSREF_BASE_URL: z.string().url().default("https://api.crossref.org"),
}).passthrough().superRefine((value,context)=>{if(value.REQUIRE_GATEWAY_TOKEN === "true" && (!value.GATEWAY_TOKEN || value.GATEWAY_TOKEN.length < 32))context.addIssue({code:"custom",path:["GATEWAY_TOKEN"],message:"Production gateway token must contain at least 32 characters"});});

export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const parsed = schema.parse(source);
  return {
    nodeEnv: parsed.NODE_ENV, host: parsed.HOST, port: parsed.PORT, publicBaseUrl: parsed.PUBLIC_BASE_URL ?? `http://${parsed.HOST}:${parsed.PORT}`, databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET, passwordPepper: parsed.PASSWORD_PEPPER,
    cookieSecure: parsed.COOKIE_SECURE === undefined ? undefined : parsed.COOKIE_SECURE === "true",
    publicationRoot:parsed.PUBLICATION_ROOT, publicationSigningKey:parsed.PUBLICATION_SIGNING_KEY_FILE, gatewayToken:parsed.GATEWAY_TOKEN, writeEnabled:parsed.BACKEND_WRITE_ENABLED === "true",
    storageProvider: parsed.STORAGE_PROVIDER, storageRoot: parsed.STORAGE_ROOT,
    cosSecretId: parsed.COS_SECRET_ID, cosSecretKey: parsed.COS_SECRET_KEY, cosRegion: parsed.COS_REGION, cosBucket: parsed.COS_BUCKET,
    cosPublicBaseUrl: parsed.COS_PUBLIC_BASE_URL, cosPathPrefix: parsed.COS_PATH_PREFIX, mediaMaxUploadBytes: parsed.MEDIA_MAX_UPLOAD_BYTES,
    openAlexApiKey: parsed.OPENALEX_API_KEY,
    scholarlySyncContactEmail: parsed.SCHOLARLY_SYNC_CONTACT_EMAIL,
    scholarlySyncEnabled: parsed.SCHOLARLY_SYNC_ENABLED === "true",
    scholarlySyncOpenAlexBaseUrl: parsed.SCHOLARLY_SYNC_OPENALEX_BASE_URL,
    scholarlySyncCrossrefBaseUrl: parsed.SCHOLARLY_SYNC_CROSSREF_BASE_URL,
  };
}
