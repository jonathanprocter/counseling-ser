import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, desc } from "drizzle-orm";
import {
  aiSummaries,
  clients,
  emotionReadings,
  escalationAlerts,
  sessions,
  transcripts,
} from "../drizzle/schema";
import { ENV } from "../server/_core/env";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

async function seed() {
  const connection = await mysql.createConnection(connectionString);
  const db = drizzle(connection);

  const clinicianId = ENV.defaultClinicianId;

  // Create a starter client if none exist for the clinician
  const existingClients = await db
    .select()
    .from(clients)
    .where(and(eq(clients.clinicianId, clinicianId), eq(clients.isActive, true)))
    .limit(1);

  let clientId: number;
  if (existingClients.length > 0) {
    clientId = existingClients[0].id;
  } else {
    const insertResult = await db.insert(clients).values({
      clinicianId,
      firstName: "Avery",
      lastName: "Jordan",
      dateOfBirth: "1994-05-14",
      gender: "Non-binary",
      pronouns: "they/them",
      email: "demo.client@example.com",
      phone: "555-0104",
      diagnosis: "Generalized Anxiety Disorder (F41.1)",
      treatmentGoals: "Reduce daily anxiety, improve sleep, build grounding skills",
      notes: "Starter demo client for local testing.",
      consentSigned: true,
      hipaaAcknowledged: true,
    });
    const header = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    clientId = Number((header as any).insertId);
  }

  // Create a starter session if none exist for the client
  const existingSessions = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.clientId, clientId), eq(sessions.clinicianId, clinicianId)))
    .orderBy(desc(sessions.sessionDate))
    .limit(1);

  let sessionId: number;
  if (existingSessions.length > 0) {
    sessionId = existingSessions[0].id;
  } else {
    const sessionDate = new Date();
    sessionDate.setDate(sessionDate.getDate() - 1);

    const insertResult = await db.insert(sessions).values({
      clientId,
      clinicianId,
      sessionDate,
      durationSeconds: 2700,
      status: "completed",
      sessionType: "Individual Therapy",
      clinicianNotes: "Reviewed breathing techniques and sleep hygiene routines.",
      avgArousal: 0.54,
      avgValence: 0.48,
      avgDominance: 0.52,
      escalationDetected: true,
    });
    const header = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    sessionId = Number((header as any).insertId);

    await db.insert(emotionReadings).values([
      { sessionId, offsetSeconds: 0, arousal: 0.45, valence: 0.52, dominance: 0.55, confidence: 0.82, rawFeatures: { jitter: 0.12 } },
      { sessionId, offsetSeconds: 300, arousal: 0.62, valence: 0.41, dominance: 0.48, confidence: 0.79, rawFeatures: { shimmer: 0.09 } },
      { sessionId, offsetSeconds: 600, arousal: 0.71, valence: 0.36, dominance: 0.42, confidence: 0.77, rawFeatures: { f0Mean: 210 } },
      { sessionId, offsetSeconds: 900, arousal: 0.58, valence: 0.47, dominance: 0.51, confidence: 0.83, rawFeatures: { hnr: 12 } },
      { sessionId, offsetSeconds: 1200, arousal: 0.49, valence: 0.55, dominance: 0.6, confidence: 0.8, rawFeatures: { f0Std: 34 } },
      { sessionId, offsetSeconds: 1500, arousal: 0.4, valence: 0.6, dominance: 0.62, confidence: 0.84, rawFeatures: { energy: 0.4 } },
    ]);

    await db
      .insert(transcripts)
      .values({
        sessionId,
        fullText:
          "Client described ongoing work stress and difficulty unwinding at night. We practiced paced breathing and reframing around intrusive worries. Client reported feeling more grounded by the end of session.",
        language: "en",
        segments: [
          { start: 0, end: 22, text: "Client described ongoing work stress and difficulty unwinding at night." },
          { start: 22, end: 48, text: "We practiced paced breathing and reframing around intrusive worries." },
          { start: 48, end: 70, text: "Client reported feeling more grounded by the end of session." },
        ],
        wordCount: 39,
        status: "completed",
      })
      .onDuplicateKeyUpdate({
        set: {
          fullText:
            "Client described ongoing work stress and difficulty unwinding at night. We practiced paced breathing and reframing around intrusive worries. Client reported feeling more grounded by the end of session.",
          language: "en",
          segments: [
            { start: 0, end: 22, text: "Client described ongoing work stress and difficulty unwinding at night." },
            { start: 22, end: 48, text: "We practiced paced breathing and reframing around intrusive worries." },
            { start: 48, end: 70, text: "Client reported feeling more grounded by the end of session." },
          ],
          wordCount: 39,
          status: "completed",
          updatedAt: new Date(),
        },
      });

    await db
      .insert(aiSummaries)
      .values({
        sessionId,
        clinicalSummary:
          "Client presented with moderate anxiety related to work demands and difficulty disengaging from intrusive thoughts. Affect was initially tense with elevated arousal, then softened following breathing practice and cognitive reframing. Overall, the session focused on stabilization and skill reinforcement.",
        emotionalThemes:
          "Themes included performance pressure, rumination, and sleep disruption. The client responded positively to grounding exercises and demonstrated openness to experimenting with new routines.",
        interventionSuggestions:
          "Continue paced breathing at bedtime, introduce a 10-minute worry journal window, and practice brief cognitive defusion strategies between sessions. Consider behavioral activation to strengthen evening wind-down rituals.",
        progressNotes:
          "Client is engaging in treatment and reporting small gains in self-regulation. Continued monitoring of sleep quality and stress reactivity is recommended.",
        riskIndicators: "No significant risk indicators identified.",
        status: "completed",
        generatedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          clinicalSummary:
            "Client presented with moderate anxiety related to work demands and difficulty disengaging from intrusive thoughts. Affect was initially tense with elevated arousal, then softened following breathing practice and cognitive reframing. Overall, the session focused on stabilization and skill reinforcement.",
          emotionalThemes:
            "Themes included performance pressure, rumination, and sleep disruption. The client responded positively to grounding exercises and demonstrated openness to experimenting with new routines.",
          interventionSuggestions:
            "Continue paced breathing at bedtime, introduce a 10-minute worry journal window, and practice brief cognitive defusion strategies between sessions. Consider behavioral activation to strengthen evening wind-down rituals.",
          progressNotes:
            "Client is engaging in treatment and reporting small gains in self-regulation. Continued monitoring of sleep quality and stress reactivity is recommended.",
          riskIndicators: "No significant risk indicators identified.",
          status: "completed",
          generatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await db.insert(escalationAlerts).values({
      sessionId,
      clientId,
      clinicianId,
      alertType: "sustained_high_arousal",
      severity: "medium",
      offsetSeconds: 600,
      description: "Sustained high arousal detected during mid-session stress discussion.",
      acknowledged: false,
      notificationSent: false,
    });
  }

  await connection.end();

  console.log(`Seed complete. Clinician ${clinicianId}, client ${clientId}, session ${sessionId}.`);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
