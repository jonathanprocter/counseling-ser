import pg from "pg";

const { Pool } = pg;

async function resetDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("Dropping all tables and types...");
    await client.query(`
      DROP TABLE IF EXISTS "escalationAlerts" CASCADE;
      DROP TABLE IF EXISTS "aiSummaries" CASCADE;
      DROP TABLE IF EXISTS "transcripts" CASCADE;
      DROP TABLE IF EXISTS "emotionReadings" CASCADE;
      DROP TABLE IF EXISTS "sessions" CASCADE;
      DROP TABLE IF EXISTS "clients" CASCADE;
      DROP TABLE IF EXISTS "users" CASCADE;
      DROP TABLE IF EXISTS "emotion_readings" CASCADE;
      DROP TYPE IF EXISTS "role" CASCADE;
      DROP TYPE IF EXISTS "session_status" CASCADE;
      DROP TYPE IF EXISTS "transcript_status" CASCADE;
      DROP TYPE IF EXISTS "ai_summary_status" CASCADE;
      DROP TYPE IF EXISTS "alert_type" CASCADE;
      DROP TYPE IF EXISTS "severity" CASCADE;
    `);
    console.log("All tables and types dropped successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

resetDb().catch(console.error);
