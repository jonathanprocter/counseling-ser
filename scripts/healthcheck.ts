import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const serUrl = process.env.SER_SERVICE_URL;

async function checkDatabase() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  const result = await client.query("SELECT 1 AS ok");
  await client.end();
  return result.rows;
}

async function checkSerService() {
  if (!serUrl) {
    return { skipped: true };
  }
  const res = await fetch(`${serUrl.replace(/\/$/, "")}/health`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`SER healthcheck failed (${res.status})`);
  }
  const data = await res.json();
  return data;
}

async function main() {
  const results: Record<string, unknown> = {};

  try {
    await checkDatabase();
    results.database = "ok";
  } catch (error) {
    results.database = { status: "error", detail: String(error) };
  }

  try {
    const ser = await checkSerService();
    results.ser = ser;
  } catch (error) {
    results.ser = { status: "error", detail: String(error) };
  }

  const hasDbError = typeof results.database === "object";
  if (hasDbError) {
    console.error("Healthcheck failed:", results);
    process.exit(1);
  }

  console.log("Healthcheck ok:", results);
}

main().catch((error) => {
  console.error("Healthcheck crashed:", error);
  process.exit(1);
});
