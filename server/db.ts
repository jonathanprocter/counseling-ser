import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  aiSummaries,
  clients,
  emotionReadings,
  escalationAlerts,
  sessions,
  transcripts,
  type Client,
  type InsertClient,
  type InsertAiSummary,
  type InsertEmotionReading,
  type InsertEscalationAlert,
  type InsertSession,
  type InsertTranscript,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Clients ──────────────────────────────────────────────────────────────────
export async function createClient(data: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(clients).values(data);
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as any).insertId);
}

export async function getClientsByClinicianId(clinicianId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.clinicianId, clinicianId), eq(clients.isActive, true)))
    .orderBy(clients.lastName);
}

export async function getClientById(id: number, clinicianId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.clinicianId, clinicianId)))
    .limit(1);
  return result[0];
}

export async function updateClient(id: number, clinicianId: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(clients)
    .set(data)
    .where(and(eq(clients.id, id), eq(clients.clinicianId, clinicianId)));
}

export async function searchClients(clinicianId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const q = `%${query}%`;
  return db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.clinicianId, clinicianId),
        eq(clients.isActive, true),
        or(like(clients.firstName, q), like(clients.lastName, q), like(clients.email, q))
      )
    )
    .orderBy(clients.lastName);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export async function createSession(data: InsertSession) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(sessions).values(data);
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as any).insertId);
}

export async function getSessionsByClientId(clientId: number, clinicianId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.clientId, clientId), eq(sessions.clinicianId, clinicianId)))
    .orderBy(desc(sessions.sessionDate));
}

export async function getSessionById(id: number, clinicianId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.clinicianId, clinicianId)))
    .limit(1);
  return result[0];
}

export async function updateSession(id: number, clinicianId: number, data: Partial<InsertSession>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(sessions)
    .set(data)
    .where(and(eq(sessions.id, id), eq(sessions.clinicianId, clinicianId)));
}

export async function getRecentSessionsByClinicianId(clinicianId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.clinicianId, clinicianId))
    .orderBy(desc(sessions.sessionDate))
    .limit(limit);
}

// ─── Emotion Readings ─────────────────────────────────────────────────────────
export async function saveEmotionReadings(readings: InsertEmotionReading[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (readings.length === 0) return;
  // Insert in chunks to avoid MySQL packet size limits
  const chunkSize = 100;
  for (let i = 0; i < readings.length; i += chunkSize) {
    await db.insert(emotionReadings).values(readings.slice(i, i + chunkSize));
  }
}

export async function getEmotionReadingsBySessionId(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(emotionReadings)
    .where(eq(emotionReadings.sessionId, sessionId))
    .orderBy(emotionReadings.offsetSeconds);
}

// ─── Transcripts ──────────────────────────────────────────────────────────────
export async function upsertTranscript(data: InsertTranscript) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(transcripts)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        fullText: data.fullText,
        segments: data.segments,
        language: data.language,
        wordCount: data.wordCount,
        status: data.status,
        updatedAt: new Date(),
      },
    });
}

export async function getTranscriptBySessionId(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .limit(1);
  return result[0];
}

// ─── AI Summaries ─────────────────────────────────────────────────────────────
export async function upsertAiSummary(data: InsertAiSummary) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(aiSummaries)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        clinicalSummary: data.clinicalSummary,
        emotionalThemes: data.emotionalThemes,
        interventionSuggestions: data.interventionSuggestions,
        progressNotes: data.progressNotes,
        riskIndicators: data.riskIndicators,
        status: data.status,
        generatedAt: data.generatedAt,
        updatedAt: new Date(),
      },
    });
}

export async function getAiSummaryBySessionId(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(aiSummaries)
    .where(eq(aiSummaries.sessionId, sessionId))
    .limit(1);
  return result[0];
}

// ─── Escalation Alerts ────────────────────────────────────────────────────────
export async function createEscalationAlert(data: InsertEscalationAlert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(escalationAlerts).values(data);
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as any).insertId);
}

export async function getAlertsByClinicianId(clinicianId: number, acknowledged = false) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(escalationAlerts)
    .where(
      and(
        eq(escalationAlerts.clinicianId, clinicianId),
        eq(escalationAlerts.acknowledged, acknowledged)
      )
    )
    .orderBy(desc(escalationAlerts.createdAt));
}

export async function acknowledgeAlert(id: number, clinicianId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(escalationAlerts)
    .set({ acknowledged: true })
    .where(and(eq(escalationAlerts.id, id), eq(escalationAlerts.clinicianId, clinicianId)));
}
