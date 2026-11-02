import "dotenv/config";
import { createServer } from "node:http";
import pg from "pg";
import { createAuthMiddleware, createPostgresAuthRepository } from "./middleware/auth.js";
import { createContractRouter } from "./routes/contract.js";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createAuthRouter } from "./routes/auth.js";
import { createConsoleRouter } from "./routes/console.js";
import { createConsoleDashboardService } from "./services/console-dashboard/consoleDashboardService.js";
import { createLabAssetsRouter } from "./routes/labAssets.js";
import { createPublicRouter } from "./routes/public.js";
import { createSiteAdminRouter } from "./routes/site-admin.js";
import { createLabAssetsService } from "./services/lab-assets/labAssetsService.js";
import { createPostgresPublicSiteRepository } from "./services/public-site/postgres-repository.js";
import { createPublicSiteService } from "./services/public-site/service.js";
import { createPostgresSiteAdminRepository } from "./services/site-admin/postgres-repository.js";
import { createSiteAdminService } from "./services/site-admin/service.js";
import { createAccountService } from "./services/account/accountService.js";
import { createProfileService } from "./services/account/profileService.js";
import { createProfileRouter } from "./routes/profile.js";
import { createUsersRouter } from "./routes/users.js";
import { createUserAdminService } from "./services/user-admin/userAdminService.js";
import { createPermissionsRouter } from "./routes/permissions.js";
import { createPermissionAdminService } from "./services/permission-admin/permissionAdminService.js";
import { createStorage } from "./services/storage/provider.js";
import { createMediaService } from "./services/media/mediaService.js";
import { createMediaRouter } from "./routes/media.js";
import { createSettingsService } from "./services/settings/settingsService.js";
import { createScholarlySyncSettingsService } from "./services/settings/scholarlySyncSettingsService.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createNotificationService } from "./services/notifications/notificationService.js";
import { createNotificationsRouter } from "./routes/notifications.js";
import { createScholarlySyncRepository } from "./services/scholarly-sync/repository.js";
import { createOpenAlexClient } from "./services/scholarly-sync/providers/openAlexClient.js";
import { createCrossrefClient } from "./services/scholarly-sync/providers/crossrefClient.js";
import { createScholarlySyncService } from "./services/scholarly-sync/service.js";
import { createScholarlySyncRouter } from "./routes/scholarly-sync.js";
import { createOpenAlexStatusMonitor } from "./services/scholarly-sync/providers/openAlexStatus.js";

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.databaseUrl });
const authRepository = createPostgresAuthRepository(pool); const authMiddleware = createAuthMiddleware(authRepository);

const publicService = createPublicSiteService(createPostgresPublicSiteRepository(pool));
const siteAdminService = createSiteAdminService(createPostgresSiteAdminRepository(pool));
const profileService = createProfileService(pool);
const scholarlySyncSettingsService = createScholarlySyncSettingsService(pool, {
  encryptionSecret: env.sessionSecret,
  fallbacks: {
    enabled: env.scholarlySyncEnabled,
    openAlexApiKey: env.openAlexApiKey,
    crossrefContactEmail: env.scholarlySyncContactEmail,
  },
});
const openAlexStatus = createOpenAlexStatusMonitor(Boolean(env.openAlexApiKey));
const scholarlySyncService = createScholarlySyncService({
  pool,
  repository: createScholarlySyncRepository(pool),
  openAlex: createOpenAlexClient({ baseUrl: env.scholarlySyncOpenAlexBaseUrl, apiKey: async () => (await scholarlySyncSettingsService.getRuntimeConfig()).openAlexApiKey, onObservation: openAlexStatus.observe }),
  crossref: createCrossrefClient({ baseUrl: env.scholarlySyncCrossrefBaseUrl, contactEmail: async () => (await scholarlySyncSettingsService.getRuntimeConfig()).crossrefContactEmail }),
  enabled: async () => (await scholarlySyncSettingsService.getRuntimeConfig()).enabled,
  providerConfig: async () => {
    const config = await scholarlySyncSettingsService.getRuntimeConfig();
    return { openAlexKeyConfigured: Boolean(config.openAlexApiKey), crossrefContactConfigured: Boolean(config.crossrefContactEmail) };
  },
  openAlexStatus,
});
const app = createApp({
  health: { database: async () => { await pool.query("SELECT 1"); return true; } },
  routers: [
    createContractRouter(),
    createAuthRouter({ repository: authRepository, authMiddleware, cookieSecure: env.cookieSecure, accountService: createAccountService(pool), trustProxy: true }),
    createProfileRouter({ authMiddleware, service: profileService, trustProxy: true }),
    createUsersRouter({ authMiddleware, service: createUserAdminService(pool), profileService, trustProxy: true }),
    createPermissionsRouter({ authMiddleware, service: createPermissionAdminService(pool), trustProxy: true }),
    createMediaRouter({ authMiddleware, service: createMediaService(pool, createStorage(env)), trustProxy: true, maxBytes: env.mediaMaxUploadBytes, publicBaseUrl: env.cosPublicBaseUrl ?? `${env.publicBaseUrl}/media`, pathPrefix: env.cosPathPrefix }),
    createSettingsRouter({ authMiddleware, service: createSettingsService(pool), scholarlySettings: scholarlySyncSettingsService, scholarlySync: scholarlySyncService, trustProxy: true }),
    createNotificationsRouter({ authMiddleware, service: createNotificationService(pool), trustProxy: true }),
    createScholarlySyncRouter({ authMiddleware, service: scholarlySyncService, trustProxy: true }),
    createConsoleRouter({ authMiddleware, dashboardService: createConsoleDashboardService(pool) }), createPublicRouter({ service: publicService }),
    createSiteAdminRouter({ authMiddleware, service: siteAdminService, trustProxy: true }),
    createLabAssetsRouter({ authMiddleware, service: createLabAssetsService(pool), trustProxy: true }),
  ],
});
const server = createServer(app);
server.listen(env.port, env.host, () => console.log(`RNAV platform listening on http://${env.host}:${env.port}`));

async function shutdown() { server.close(); await pool.end(); process.exit(0); }
process.once("SIGINT", () => void shutdown()); process.once("SIGTERM", () => void shutdown());
