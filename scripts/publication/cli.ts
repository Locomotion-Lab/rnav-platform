import "dotenv/config";
import { resolve } from "node:path";
import { approveBundle, activateBundle } from "@rnav/publication";

const [command, directory, argument, expectedCurrent] = process.argv.slice(2);
if (!directory) throw new Error("Usage: publication prepare DIR | approve DIR SHA256 | activate DIR PUBLIC_ROOT EXPECTED_CURRENT_ID_OR_none");
if (command === "prepare") {
  const [{default:pg},{loadEnv},{createStorage},{preparePublication}] = await Promise.all([import("pg"),import("../../server/config/env.js"),import("../../server/services/storage/provider.js"),import("../../server/services/public-site/publication.js")]);
  const env=loadEnv(); const pool=new pg.Pool({connectionString:env.databaseUrl});
  try { console.log(JSON.stringify(await preparePublication(pool,createStorage(env),resolve(directory)))); } finally { await pool.end(); }
} else if (command === "approve" && argument) {
  await approveBundle(resolve(directory),argument); console.log("Reviewed snapshot approved");
} else if (command === "activate" && argument && expectedCurrent) {
  await activateBundle(resolve(directory),resolve(argument),expectedCurrent); console.log("Public version activated locally");
} else throw new Error("Invalid publication command/arguments");
