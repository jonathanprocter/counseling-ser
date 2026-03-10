import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users (clinicians) ───────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clients ──────────────────────────────────────────────────────────────────
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  clinicianId: int("clinicianId").notNull(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  dateOfBirth: varchar("dateOfBirth", { length: 20 }),
  gender: varchar("gender", { length: 50 }),
  pronouns: varchar("pronouns", { length: 50 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  diagnosis: text("diagnosis"),
  treatmentGoals: text("treatmentGoals"),
  notes: text("notes"),
  consentSigned: boolean("consentSigned").default(false).notNull(),
  hipaaAcknowledged: boolean("hipaaAcknowledged").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  clinicianId: int("clinicianId").notNull(),
  sessionDate: timestamp("sessionDate").notNull(),
  durationSeconds: int("durationSeconds"),
  audioUrl: text("audioUrl"),
  audioKey: varchar("audioKey", { length: 512 }),
  status: mysqlEnum("status", [
    "recording",
    "uploaded",
    "analyzing",
    "completed",
    "error",
  ])
    .default("recording")
    .notNull(),
  clinicianNotes: text("clinicianNotes"),
  sessionType: varchar("sessionType", { length: 100 }),
  // Aggregate emotion scores for the whole session
  avgArousal: float("avgArousal"),
  avgValence: float("avgValence"),
  avgDominance: float("avgDominance"),
  escalationDetected: boolean("escalationDetected").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

// ─── Emotion Readings ─────────────────────────────────────────────────────────
// One row per audio segment (e.g., every 2 seconds of audio)
export const emotionReadings = mysqlTable("emotionReadings", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  offsetSeconds: float("offsetSeconds").notNull(), // position in session audio
  arousal: float("arousal").notNull(),             // 0–1
  valence: float("valence").notNull(),             // 0–1
  dominance: float("dominance").notNull(),         // 0–1
  confidence: float("confidence"),                 // model confidence
  rawFeatures: json("rawFeatures").$type<Record<string, number>>(), // eGeMAPS features
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmotionReading = typeof emotionReadings.$inferSelect;
export type InsertEmotionReading = typeof emotionReadings.$inferInsert;

// ─── Transcripts ──────────────────────────────────────────────────────────────
export const transcripts = mysqlTable("transcripts", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().unique(),
  fullText: text("fullText"),
  language: varchar("language", { length: 10 }),
  // Whisper segments stored as JSON array: [{start, end, text}]
  segments: json("segments").$type<
    Array<{ start: number; end: number; text: string }>
  >(),
  wordCount: int("wordCount"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "error"])
    .default("pending")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transcript = typeof transcripts.$inferSelect;
export type InsertTranscript = typeof transcripts.$inferInsert;

// ─── AI Summaries ─────────────────────────────────────────────────────────────
export const aiSummaries = mysqlTable("aiSummaries", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().unique(),
  clinicalSummary: text("clinicalSummary"),
  emotionalThemes: text("emotionalThemes"),
  interventionSuggestions: text("interventionSuggestions"),
  progressNotes: text("progressNotes"),
  riskIndicators: text("riskIndicators"),
  status: mysqlEnum("status", ["pending", "generating", "completed", "error"])
    .default("pending")
    .notNull(),
  generatedAt: timestamp("generatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiSummary = typeof aiSummaries.$inferSelect;
export type InsertAiSummary = typeof aiSummaries.$inferInsert;

// ─── Escalation Alerts ────────────────────────────────────────────────────────
export const escalationAlerts = mysqlTable("escalationAlerts", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  clientId: int("clientId").notNull(),
  clinicianId: int("clinicianId").notNull(),
  alertType: mysqlEnum("alertType", [
    "sustained_high_arousal",
    "sudden_valence_drop",
    "low_dominance_sustained",
    "combined_distress",
  ]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  offsetSeconds: float("offsetSeconds"), // when in session it occurred
  description: text("description"),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  notificationSent: boolean("notificationSent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EscalationAlert = typeof escalationAlerts.$inferSelect;
export type InsertEscalationAlert = typeof escalationAlerts.$inferInsert;
