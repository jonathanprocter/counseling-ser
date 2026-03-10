import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createClient,
  getClientsByClinicianId,
  getClientById,
  updateClient,
  searchClients,
  createSession,
  getSessionsByClientId,
  getSessionById,
  updateSession,
  getRecentSessionsByClinicianId,
  saveEmotionReadings,
  getEmotionReadingsBySessionId,
  upsertTranscript,
  getTranscriptBySessionId,
  upsertAiSummary,
  getAiSummaryBySessionId,
  createEscalationAlert,
  getAlertsByClinicianId,
  acknowledgeAlert,
} from "./db";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { TRPCError } from "@trpc/server";
import axios from "axios";

const SER_SERVICE_URL = process.env.SER_SERVICE_URL || "http://localhost:5001";

// ─── Clients Router ───────────────────────────────────────────────────────────
const clientsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return getClientsByClinicianId(ctx.clinicianId);
  }),

  search: publicProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      return searchClients(ctx.clinicianId, input.query);
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(input.id, ctx.clinicianId);
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });
      return client;
    }),

  create: publicProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        dateOfBirth: z.string().optional(),
        gender: z.string().optional(),
        pronouns: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        diagnosis: z.string().optional(),
        treatmentGoals: z.string().optional(),
        notes: z.string().optional(),
        consentSigned: z.boolean().default(false),
        hipaaAcknowledged: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createClient({ ...input, clinicianId: ctx.clinicianId });
      return { id };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        dateOfBirth: z.string().optional(),
        gender: z.string().optional(),
        pronouns: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        diagnosis: z.string().optional(),
        treatmentGoals: z.string().optional(),
        notes: z.string().optional(),
        consentSigned: z.boolean().optional(),
        hipaaAcknowledged: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateClient(id, ctx.clinicianId, data);
      return { success: true };
    }),
});

// ─── Sessions Router ──────────────────────────────────────────────────────────
const sessionsRouter = router({
  listByClient: publicProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getSessionsByClientId(input.clientId, ctx.clinicianId);
    }),

  recent: publicProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      return getRecentSessionsByClinicianId(ctx.clinicianId, input.limit);
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.id, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      return session;
    }),

  create: publicProcedure
    .input(
      z.object({
        clientId: z.number(),
        sessionDate: z.string(),
        sessionType: z.string().optional(),
        clinicianNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createSession({
        clientId: input.clientId,
        clinicianId: ctx.clinicianId,
        sessionDate: new Date(input.sessionDate),
        sessionType: input.sessionType,
        clinicianNotes: input.clinicianNotes,
        status: "recording",
      });
      return { id };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        status: z
          .enum(["recording", "uploaded", "analyzing", "completed", "error"])
          .optional(),
        audioUrl: z.string().optional(),
        audioKey: z.string().optional(),
        durationSeconds: z.number().optional(),
        clinicianNotes: z.string().optional(),
        avgArousal: z.number().optional(),
        avgValence: z.number().optional(),
        avgDominance: z.number().optional(),
        escalationDetected: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateSession(id, ctx.clinicianId, data);
      return { success: true };
    }),

  // Upload audio to S3 and return the URL
  uploadAudio: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        audioBase64: z.string(),
        mimeType: z.string().default("audio/webm"),
        filename: z.string().default("session.webm"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.audioBase64, "base64");
      const key = `sessions/${ctx.clinicianId}/${input.sessionId}/${Date.now()}-${input.filename}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await updateSession(input.sessionId, ctx.clinicianId, {
        audioUrl: url,
        audioKey: key,
        status: "uploaded",
      });
      return { url, key };
    }),
});

// ─── Emotions Router ──────────────────────────────────────────────────────────
const emotionsRouter = router({
  getBySession: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify session belongs to clinician
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      return getEmotionReadingsBySessionId(input.sessionId);
    }),

  // Trigger SER analysis on a session's audio
  analyzeSession: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (!session.audioUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No audio uploaded" });

      // Mark as analyzing
      await updateSession(input.sessionId, ctx.clinicianId, { status: "analyzing" });

      try {
        // Call Python SER service
        const serResponse = await axios.post(
          `${SER_SERVICE_URL}/analyze-url`,
          { audioUrl: session.audioUrl },
          { timeout: 300000 } // 5 min timeout for long sessions
        );

        const { readings, total_duration } = serResponse.data as {
          readings: Array<{
            offset_seconds: number;
            arousal: number;
            valence: number;
            dominance: number;
            confidence: number;
            raw_features: Record<string, number>;
          }>;
          total_duration: number;
        };

        if (!Array.isArray(readings) || readings.length === 0) {
          throw new Error("SER service returned no emotion readings");
        }

        // Save readings to DB
        await saveEmotionReadings(
          readings.map((r) => ({
            sessionId: input.sessionId,
            offsetSeconds: r.offset_seconds,
            arousal: r.arousal,
            valence: r.valence,
            dominance: r.dominance,
            confidence: r.confidence,
            rawFeatures: r.raw_features,
          }))
        );

        // Compute session averages
        const avgArousal = readings.reduce((s, r) => s + r.arousal, 0) / readings.length;
        const avgValence = readings.reduce((s, r) => s + r.valence, 0) / readings.length;
        const avgDominance = readings.reduce((s, r) => s + r.dominance, 0) / readings.length;

        // Detect escalation patterns
        const escalationAlerts_ = detectEscalationPatterns(readings, input.sessionId, session.clientId, ctx.clinicianId);
        const escalationDetected = escalationAlerts_.length > 0;

        // Save alerts
        for (const alert of escalationAlerts_) {
          await createEscalationAlert(alert);
        }

        // Send notification if escalation detected
        if (escalationDetected) {
          await notifyOwner({
            title: `⚠️ Escalation Detected — Session #${input.sessionId}`,
            content: `Emotional escalation patterns were detected in session #${input.sessionId}. Please review the session timeline.`,
          });
        }

        // Update session with aggregates
        await updateSession(input.sessionId, ctx.clinicianId, {
          status: "completed",
          durationSeconds: Math.round(total_duration),
          avgArousal,
          avgValence,
          avgDominance,
          escalationDetected,
        });

        return { success: true, readingCount: readings.length, escalationDetected };
      } catch (error: any) {
        await updateSession(input.sessionId, ctx.clinicianId, { status: "error" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `SER analysis failed: ${error.message}`,
        });
      }
    }),
  // Save a single real-time reading from the live session stream
  saveReading: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        offsetSeconds: z.number(),
        arousal: z.number(),
        valence: z.number(),
        dominance: z.number(),
        confidence: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await saveEmotionReadings([{
        sessionId: input.sessionId,
        offsetSeconds: input.offsetSeconds,
        arousal: input.arousal,
        valence: input.valence,
        dominance: input.dominance,
        confidence: input.confidence,
      }]);
      return { success: true };
    }),
});

// ─── Escalation Detection ─────────────────────────────────────────────────────
function detectEscalationPatterns(
  readings: Array<{ offset_seconds: number; arousal: number; valence: number; dominance: number }>,
  sessionId: number,
  clientId: number,
  clinicianId: number
) {
  const alerts: Array<{
    sessionId: number;
    clientId: number;
    clinicianId: number;
    alertType: "sustained_high_arousal" | "sudden_valence_drop" | "low_dominance_sustained" | "combined_distress";
    severity: "low" | "medium" | "high" | "critical";
    offsetSeconds: number;
    description: string;
  }> = [];

  if (readings.length < 3) return alerts;

  // Sliding window: 5 consecutive readings (~10s)
  const windowSize = 5;
  for (let i = 0; i <= readings.length - windowSize; i++) {
    const window = readings.slice(i, i + windowSize);
    const avgArousal = window.reduce((s, r) => s + r.arousal, 0) / windowSize;
    const avgValence = window.reduce((s, r) => s + r.valence, 0) / windowSize;
    const avgDominance = window.reduce((s, r) => s + r.dominance, 0) / windowSize;
    const offset = window[0].offset_seconds;

    // Sustained high arousal (>0.75 for 5 consecutive windows)
    if (avgArousal > 0.75) {
      const severity = avgArousal > 0.88 ? "critical" : avgArousal > 0.82 ? "high" : "medium";
      alerts.push({
        sessionId, clientId, clinicianId,
        alertType: "sustained_high_arousal",
        severity,
        offsetSeconds: offset,
        description: `Sustained high arousal (avg ${(avgArousal * 100).toFixed(0)}%) detected at ${offset.toFixed(0)}s`,
      });
    }

    // Sudden valence drop (check vs previous window)
    if (i > 0) {
      const prevWindow = readings.slice(i - 1, i + windowSize - 1);
      const prevValence = prevWindow.reduce((s, r) => s + r.valence, 0) / windowSize;
      const valenceDrop = prevValence - avgValence;
      if (valenceDrop > 0.25) {
        alerts.push({
          sessionId, clientId, clinicianId,
          alertType: "sudden_valence_drop",
          severity: valenceDrop > 0.4 ? "high" : "medium",
          offsetSeconds: offset,
          description: `Sudden valence drop of ${(valenceDrop * 100).toFixed(0)}% at ${offset.toFixed(0)}s`,
        });
      }
    }

    // Combined distress: high arousal + low valence + low dominance
    if (avgArousal > 0.7 && avgValence < 0.35 && avgDominance < 0.35) {
      alerts.push({
        sessionId, clientId, clinicianId,
        alertType: "combined_distress",
        severity: "critical",
        offsetSeconds: offset,
        description: `Combined distress pattern at ${offset.toFixed(0)}s: arousal ${(avgArousal * 100).toFixed(0)}%, valence ${(avgValence * 100).toFixed(0)}%, dominance ${(avgDominance * 100).toFixed(0)}%`,
      });
    }
  }

  // Deduplicate: keep only first occurrence of each type within 30s
  const deduped: typeof alerts = [];
  const lastSeen: Record<string, number> = {};
  for (const alert of alerts) {
    const last = lastSeen[alert.alertType] ?? -Infinity;
    if (alert.offsetSeconds - last > 30) {
      deduped.push(alert);
      lastSeen[alert.alertType] = alert.offsetSeconds;
    }
  }
  return deduped;
}

// ─── Transcription Router ─────────────────────────────────────────────────────
const transcriptionRouter = router({
  get: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      return getTranscriptBySessionId(input.sessionId);
    }),

  transcribe: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (!session.audioUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No audio uploaded" });

      // Mark as processing
      await upsertTranscript({ sessionId: input.sessionId, status: "processing" });

      try {
        const result = await transcribeAudio({
          audioUrl: session.audioUrl,
          language: "en",
          prompt: "This is a counseling therapy session.",
        });

        if ("error" in result) {
          const details = result.details ? ` (${result.details})` : "";
          throw new Error(`${result.error}${details}`);
        }

        const whisperResult = result as any;
        const fullText: string = whisperResult.text ?? "";
        const wordCount = fullText.split(/\s+/).filter(Boolean).length;
        const segments = whisperResult.segments?.map((s: any) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        })) ?? [];

        await upsertTranscript({
          sessionId: input.sessionId,
          fullText,
          language: whisperResult.language ?? "en",
          segments,
          wordCount,
          status: "completed",
        });

        return { success: true, wordCount };
      } catch (error: any) {
        await upsertTranscript({ sessionId: input.sessionId, status: "error" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Transcription failed: ${error.message}`,
        });
      }
    }),
});

// ─── AI Summary Router ────────────────────────────────────────────────────────
const aiSummaryRouter = router({
  get: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      return getAiSummaryBySessionId(input.sessionId);
    }),

  generate: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const transcript = await getTranscriptBySessionId(input.sessionId);
      const readings = await getEmotionReadingsBySessionId(input.sessionId);

      if (!transcript?.fullText && readings.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session needs transcript or emotion data before generating summary",
        });
      }

      await upsertAiSummary({ sessionId: input.sessionId, status: "generating" });

      try {
        // Build emotion summary stats
        const emotionStats = readings.length > 0 ? {
          avgArousal: (readings.reduce((s, r) => s + r.arousal, 0) / readings.length).toFixed(3),
          avgValence: (readings.reduce((s, r) => s + r.valence, 0) / readings.length).toFixed(3),
          avgDominance: (readings.reduce((s, r) => s + r.dominance, 0) / readings.length).toFixed(3),
          maxArousal: Math.max(...readings.map((r) => r.arousal)).toFixed(3),
          minValence: Math.min(...readings.map((r) => r.valence)).toFixed(3),
          readingCount: readings.length,
        } : null;

        const systemPrompt = `You are a highly skilled clinical psychologist specializing in creating comprehensive, insightful session summaries for mental health counselors. Your analysis should be clinically sophisticated, evidence-based, and immediately actionable. Use frameworks from ACT, DBT, Narrative Therapy, and Existential approaches where appropriate. Return a JSON object with the following fields: clinicalSummary, emotionalThemes, interventionSuggestions, progressNotes, riskIndicators.`;

        const userPrompt = `Analyze this counseling session and provide a comprehensive clinical summary.

Session Date: ${session.sessionDate}
Session Type: ${session.sessionType || "Individual Therapy"}
Duration: ${session.durationSeconds ? Math.round(session.durationSeconds / 60) + " minutes" : "Unknown"}

${emotionStats ? `ACOUSTIC EMOTION DATA (from speech analysis):
- Average Arousal: ${emotionStats.avgArousal} (0=calm, 1=activated)
- Average Valence: ${emotionStats.avgValence} (0=negative, 1=positive)
- Average Dominance: ${emotionStats.avgDominance} (0=submissive, 1=dominant)
- Peak Arousal: ${emotionStats.maxArousal}
- Lowest Valence: ${emotionStats.minValence}
- Analysis segments: ${emotionStats.readingCount}` : ""}

${transcript?.fullText ? `SESSION TRANSCRIPT:
${transcript.fullText.substring(0, 8000)}` : "No transcript available."}

${session.clinicianNotes ? `CLINICIAN NOTES: ${session.clinicianNotes}` : ""}

Provide your analysis as a JSON object with these exact fields:
- clinicalSummary: Comprehensive 3-4 paragraph clinical summary integrating acoustic and verbal data
- emotionalThemes: Key emotional themes identified (2-3 paragraphs)
- interventionSuggestions: Specific therapeutic interventions suggested for next session (2-3 paragraphs)
- progressNotes: Assessment of therapeutic progress and areas of concern (1-2 paragraphs)
- riskIndicators: Any risk factors or safety concerns identified (1 paragraph, or "No significant risk indicators identified" if none)`;

        const response = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemPrompt },
            { role: "user" as const, content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "clinical_summary",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  clinicalSummary: { type: "string" },
                  emotionalThemes: { type: "string" },
                  interventionSuggestions: { type: "string" },
                  progressNotes: { type: "string" },
                  riskIndicators: { type: "string" },
                },
                required: ["clinicalSummary", "emotionalThemes", "interventionSuggestions", "progressNotes", "riskIndicators"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : (rawContent as any[])?.[0]?.text ?? "";
        if (!content) throw new Error("Empty LLM response");

        const parsed = JSON.parse(content);

        await upsertAiSummary({
          sessionId: input.sessionId,
          clinicalSummary: parsed.clinicalSummary,
          emotionalThemes: parsed.emotionalThemes,
          interventionSuggestions: parsed.interventionSuggestions,
          progressNotes: parsed.progressNotes,
          riskIndicators: parsed.riskIndicators,
          status: "completed",
          generatedAt: new Date(),
        });

        return { success: true };
      } catch (error: any) {
        await upsertAiSummary({ sessionId: input.sessionId, status: "error" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `AI summary generation failed: ${error.message}`,
        });
      }
    }),
});

// ─── Alerts Router ────────────────────────────────────────────────────────────
const alertsRouter = router({
  list: publicProcedure
    .input(z.object({ acknowledged: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      return getAlertsByClinicianId(ctx.clinicianId, input.acknowledged);
    }),

  acknowledge: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await acknowledgeAlert(input.id, ctx.clinicianId);
      return { success: true };
    }),
  // Create a real-time escalation alert from the live session
  create: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        alertType: z.enum([
          "sustained_high_arousal",
          "sudden_valence_drop",
          "low_dominance_sustained",
          "combined_distress",
          "high_arousal",
          "low_valence",
        ]),
        severity: z.enum(["low", "medium", "high", "critical"]),
        message: z.string().optional(),
        offsetSeconds: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.clinicianId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      // Map frontend alert types to schema enum
      const alertTypeMap: Record<string, "sustained_high_arousal" | "sudden_valence_drop" | "low_dominance_sustained" | "combined_distress"> = {
        high_arousal: "sustained_high_arousal",
        low_valence: "sudden_valence_drop",
        sustained_high_arousal: "sustained_high_arousal",
        sudden_valence_drop: "sudden_valence_drop",
        low_dominance_sustained: "low_dominance_sustained",
        combined_distress: "combined_distress",
      };
      const mappedType = alertTypeMap[input.alertType] ?? "combined_distress";
      const id = await createEscalationAlert({
        sessionId: input.sessionId,
        clientId: session.clientId,
        clinicianId: ctx.clinicianId,
        alertType: mappedType,
        severity: input.severity,
        description: input.message,
        offsetSeconds: input.offsetSeconds,
      });
      return { success: true, id };
    }),
});

// ─── SER Service Status ───────────────────────────────────────────────────────
const serRouter = router({
  health: publicProcedure.query(async () => {
    try {
      const res = await axios.get(`${SER_SERVICE_URL}/health`, { timeout: 5000 });
      return res.data;
    } catch {
      return { status: "offline", model_loaded: false };
    }
  }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  clients: clientsRouter,
  sessions: sessionsRouter,
  emotions: emotionsRouter,
  transcription: transcriptionRouter,
  aiSummary: aiSummaryRouter,
  alerts: alertsRouter,
  ser: serRouter,
});

export type AppRouter = typeof appRouter;
