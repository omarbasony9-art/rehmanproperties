import { initDb } from "./db.js";
import app from "./app.js";

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required.");
}
const port = Number(rawPort);
if (isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  await initDb();

  app.listen(port, "0.0.0.0", () => {
    console.log(`[server] Foreclosure Tracker listening on port ${port}`);
    console.log(`[server] Admin UI: http://localhost:${port}/admin`);
  });
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
