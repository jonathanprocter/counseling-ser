import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  real,
  json,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);

export const sessionStatusEnum = pgEnum("session_status", [
  "recording",
  "uploaded",
  "analyzing",
  "completed",
  "error",
]);

export const transcriptStatusEnum = pgEnum("transcript_status", [
  "pending",
  "processing",
  "completed",
  "error",
]);

export const aiSummaryStatusEnum = pgEnum("ai_summary_status", [
  "pending",
  "generating",
  "completed",
  "error",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "sustained_high_arousal",
  "sudden_valence_drop",
  "low_dominance_sustained",
  "combined_distress",
]);

export const severityEnum = pgEnum("severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

// ─── Users (clinicians) ───────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clients ──────────────────────────────────────────────────────────────────
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinicianId").notNull(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),
  clinicianId: integer("clinicianId").notNull(),
  sessionDate: timestamp("sessionDate").notNull(),
  durationSeconds: integer("durationSeconds"),
  audioUrl: text("audioUrl"),
  audioKey: varchar("audioKey", { length: 512 }),
  status: sessionStatusEnum("status").default("recording").notNull(),
  clinicianNotes: text("clinicianNotes"),
  sessionType: varchar("sessionType", { length: 100 }),
  avgArousal: real("avgArousal"),
  avgValence: real("avgValence"),
  avgDominance: real("avgDominance"),
  escalationDetected: boolean("escalationDetected").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

// ─── Emotion Readings ─────────────────────────────────────────────────────────
export const emotionReadings = pgTable("emotionReadings", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull(),
  offsetSeconds: real("offsetSeconds").notNull(),
  arousal: real("arousal").notNull(),
  valence: real("valence").notNull(),
  dominance: real("dominance").notNull(),
  confidence: real("confidence"),
  rawFeatures: json("rawFeatures").$type<Record<string, number>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmotionReading = typeof emotionReadings.$inferSelect;
export type InsertEmotionReading = typeof emotionReadings.$inferInsert;

// ─── Transcripts ──────────────────────────────────────────────────────────────
export const transcripts = pgTable("transcripts", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().unique(),
  fullText: text("fullText"),
  language: varchar("language", { length: 10 }),
  segments: json("segments").$type<
    Array<{ start: number; end: number; text: string }>
  >(),
  wordCount: integer("wordCount"),
  status: transcriptStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Transcript = typeof transcripts.$inferSelect;
export type InsertTranscript = typeof transcripts.$inferInsert;

// ─── AI Summaries ─────────────────────────────────────────────────────────────
export const aiSummaries = pgTable("aiSummaries", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().unique(),
  clinicalSummary: text("clinicalSummary"),
  emotionalThemes: text("emotionalThemes"),
  interventionSuggestions: text("interventionSuggestions"),
  progressNotes: text("progressNotes"),
  riskIndicators: text("riskIndicators"),
  status: aiSummaryStatusEnum("status").default("pending").notNull(),
  generatedAt: timestamp("generatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AiSummary = typeof aiSummaries.$inferSelect;
export type InsertAiSummary = typeof aiSummaries.$inferInsert;

// ─── Escalation Alerts ────────────────────────────────────────────────────────
export const escalationAlerts = pgTable("escalationAlerts", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull(),
  clientId: integer("clientId").notNull(),
  clinicianId: integer("clinicianId").notNull(),
  alertType: alertTypeEnum("alertType").notNull(),
  severity: severityEnum("severity").notNull(),
  offsetSeconds: real("offsetSeconds"),
  description: text("description"),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  notificationSent: boolean("notificationSent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EscalationAlert = typeof escalationAlerts.$inferSelect;
export type InsertEscalationAlert = typeof escalationAlerts.$inferInsert;
