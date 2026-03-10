/**
 * ClinicalVoice — Real-Time Emotion Streaming via Socket.io
 *
 * Architecture:
 *   Browser (MediaRecorder) → 5-second audio blobs → POST /api/ser/chunk
 *   Express handler → forwards chunk to Python SER /analyze-chunk
 *   Python SER → accumulates 30-second sliding window → runs wav2vec2 inference
 *   When inference fires → Express emits 'emotion:reading' to the session room
 *   React frontend → Socket.io client subscribes to room → updates live chart
 */

import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import express, { Request, Response } from "express";
import axios from "axios";

const SER_SERVICE_URL = process.env.SER_SERVICE_URL || "http://localhost:5001";

// ─── Socket.io Setup ─────────────────────────────────────────────────────────
let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/socket.io",
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Client joins a room keyed by sessionId so only that session's clinician
    // receives emotion updates
    socket.on("join:session", (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      console.log(`[Socket.io] ${socket.id} joined session:${sessionId}`);
    });

    socket.on("leave:session", (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  console.log("[Socket.io] Real-time emotion server initialized");
  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

// ─── Chunk Upload Route ───────────────────────────────────────────────────────
/**
 * POST /api/ser/chunk
 * Accepts a multipart upload with an audio chunk and session metadata.
 * Forwards to the Python SER /analyze-chunk endpoint.
 * If inference fires, emits 'emotion:reading' to the session room via Socket.io.
 */
export function registerChunkRoute(app: express.Application) {
  // Use raw body parsing for multipart — handled by multer-style passthrough
  app.post(
    "/api/ser/chunk",
    express.raw({ type: "*/*", limit: "10mb" }),
    async (req: Request, res: Response) => {
      try {
        // The browser sends multipart/form-data — we forward the raw body
        // directly to the Python service preserving the content-type header
        const contentType = req.headers["content-type"] || "multipart/form-data";

        const response = await axios.post(
          `${SER_SERVICE_URL}/analyze-chunk`,
          req.body,
          {
            headers: {
              "Content-Type": contentType,
            },
            timeout: 60000, // 60s — wav2vec2 on 30s audio can take ~5-10s
          }
        );

        const result = response.data;

        // If the Python service ran inference, broadcast to the session room
        if (result.ready && result.reading && io) {
          const sessionId = extractSessionId(req);
          if (sessionId) {
            io.to(`session:${sessionId}`).emit("emotion:reading", {
              sessionId,
              reading: result.reading,
              bufferedSeconds: result.buffered_seconds,
              modelUsed: result.model_used,
              timestamp: Date.now(),
            });
          }
        }

        res.json(result);
      } catch (err: unknown) {
        const error = err as { message?: string; response?: { data?: unknown } };
        console.error("[SER Chunk] Error:", error.message);
        res.status(500).json({
          error: "SER chunk processing failed",
          detail: error.response?.data || error.message,
        });
      }
    }
  );

  // Session clear endpoint
  app.post("/api/ser/session-clear", express.json(), async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;
      await axios.post(`${SER_SERVICE_URL}/session-clear`, { sessionId }, { timeout: 5000 });
      res.json({ cleared: true });
    } catch {
      res.json({ cleared: false });
    }
  });

  // SER health proxy
  app.get("/api/ser/health", async (_req: Request, res: Response) => {
    try {
      const response = await axios.get(`${SER_SERVICE_URL}/health`, { timeout: 5000 });
      res.json(response.data);
    } catch {
      res.status(503).json({ status: "offline", model_loaded: false });
    }
  });
}

function extractSessionId(req: Request): string | null {
  // Try to extract sessionId from the multipart form body
  // The raw body is a Buffer; we do a simple regex scan for the field
  if (Buffer.isBuffer(req.body)) {
    const bodyStr = req.body.toString("utf8", 0, Math.min(req.body.length, 2048));
    const match = bodyStr.match(/name="sessionId"\r\n\r\n([^\r\n]+)/);
    if (match) return match[1].trim();
  }
  return null;
}
