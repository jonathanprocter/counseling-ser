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
      DROP TABLE IF EXISTS "conversation_reports" CASCADE;
      DROP TYPE IF EXISTS "role" CASCADE;
      DROP TYPE IF EXISTS "session_status" CASCADE;
      DROP TYPE IF EXISTS "transcript_status" CASCADE;
      DROP TYPE IF EXISTS "ai_summary_status" CASCADE;
      DROP TYPE IF EXISTS "alert_type" CASCADE;
      DROP TYPE IF EXISTS "severity" CASCADE;
    `);
    console.log("All tables and types dropped successfully.");

    console.log("Creating enums...");
    await client.query(`
      CREATE TYPE "role" AS ENUM ('user', 'admin');
      CREATE TYPE "session_status" AS ENUM ('recording', 'uploaded', 'analyzing', 'completed', 'error');
      CREATE TYPE "transcript_status" AS ENUM ('pending', 'processing', 'completed', 'error');
      CREATE TYPE "ai_summary_status" AS ENUM ('pending', 'generating', 'completed', 'error');
      CREATE TYPE "alert_type" AS ENUM ('sustained_high_arousal', 'sudden_valence_drop', 'low_dominance_sustained', 'combined_distress');
      CREATE TYPE "severity" AS ENUM ('low', 'medium', 'high', 'critical');
    `);
    console.log("Enums created.");

    console.log("Creating tables...");
    await client.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "openId" VARCHAR(64) NOT NULL UNIQUE,
        "name" TEXT,
        "email" VARCHAR(320),
        "loginMethod" VARCHAR(64),
        "role" "role" NOT NULL DEFAULT 'user',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "lastSignedIn" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "clients" (
        "id" SERIAL PRIMARY KEY,
        "clinicianId" INTEGER NOT NULL,
        "firstName" VARCHAR(100) NOT NULL,
        "lastName" VARCHAR(100) NOT NULL,
        "dateOfBirth" VARCHAR(20),
        "gender" VARCHAR(50),
        "pronouns" VARCHAR(50),
        "email" VARCHAR(320),
        "phone" VARCHAR(30),
        "diagnosis" TEXT,
        "treatmentGoals" TEXT,
        "notes" TEXT,
        "consentSigned" BOOLEAN NOT NULL DEFAULT FALSE,
        "hipaaAcknowledged" BOOLEAN NOT NULL DEFAULT FALSE,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "sessions" (
        "id" SERIAL PRIMARY KEY,
        "clientId" INTEGER NOT NULL,
        "clinicianId" INTEGER NOT NULL,
        "sessionDate" TIMESTAMP NOT NULL,
        "durationSeconds" INTEGER,
        "audioUrl" TEXT,
        "audioKey" VARCHAR(512),
        "status" "session_status" NOT NULL DEFAULT 'recording',
        "clinicianNotes" TEXT,
        "sessionType" VARCHAR(100),
        "avgArousal" REAL,
        "avgValence" REAL,
        "avgDominance" REAL,
        "escalationDetected" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "emotionReadings" (
        "id" SERIAL PRIMARY KEY,
        "sessionId" INTEGER NOT NULL,
        "offsetSeconds" REAL NOT NULL,
        "arousal" REAL NOT NULL,
        "valence" REAL NOT NULL,
        "dominance" REAL NOT NULL,
        "confidence" REAL,
        "rawFeatures" JSON,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "transcripts" (
        "id" SERIAL PRIMARY KEY,
        "sessionId" INTEGER NOT NULL UNIQUE,
        "fullText" TEXT,
        "language" VARCHAR(10),
        "segments" JSON,
        "wordCount" INTEGER,
        "status" "transcript_status" NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "aiSummaries" (
        "id" SERIAL PRIMARY KEY,
        "sessionId" INTEGER NOT NULL UNIQUE,
        "clinicalSummary" TEXT,
        "emotionalThemes" TEXT,
        "interventionSuggestions" TEXT,
        "progressNotes" TEXT,
        "riskIndicators" TEXT,
        "status" "ai_summary_status" NOT NULL DEFAULT 'pending',
        "generatedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "escalationAlerts" (
        "id" SERIAL PRIMARY KEY,
        "sessionId" INTEGER NOT NULL,
        "clientId" INTEGER NOT NULL,
        "clinicianId" INTEGER NOT NULL,
        "alertType" "alert_type" NOT NULL,
        "severity" "severity" NOT NULL,
        "offsetSeconds" REAL,
        "description" TEXT,
        "acknowledged" BOOLEAN NOT NULL DEFAULT FALSE,
        "notificationSent" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("All tables created successfully.");

    // Verify the clients table
    const result = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'clients' 
      ORDER BY ordinal_position;
    `);
    console.log("Clients table columns:", JSON.stringify(result.rows, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

resetDb().catch(console.error);
