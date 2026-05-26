import { startServer } from "./src/api/server";
import { loadConfig } from "./src/config";

const config = loadConfig();

console.log("[worker] Starting seriesAPI Download & Queue Worker...");
console.log(`[worker] Port: ${config.port}`);
console.log(`[worker] Storage: ${config.storageBackend}`);
console.log(`[worker] DB: ${config.databasePath}`);
console.log(`[worker] Max concurrent transcodes: ${config.maxConcurrentTranscodes}`);

const { stop } = await startServer(config);

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM — shutting down...");
  await stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[worker] SIGINT — shutting down...");
  await stop();
  process.exit(0);
});
