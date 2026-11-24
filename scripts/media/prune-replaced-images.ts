import pg from "pg";
import { loadEnv } from "../../server/config/env.js";
import { createMediaService } from "../../server/services/media/mediaService.js";
import { createStorage } from "../../server/services/storage/provider.js";

const env = loadEnv();
if (!env.writeEnabled) {
  console.log("Skipped media cleanup while business writes are disabled");
} else {
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  try {
    const result = await createMediaService(pool, createStorage(env)).pruneReplacedImages();
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
