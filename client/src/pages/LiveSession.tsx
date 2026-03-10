/**
 * LiveSession — Real-Time In-Session Emotion Monitoring
 *
 * Architecture:
 *   MediaRecorder → 5-second blobs → POST /api/ser/chunk (multipart)
 *   Express → Python SER /analyze-chunk (30s sliding window, 5s step)
 *   Socket.io → 'emotion:reading' event → live Recharts update
 *
 * The 30-second window means the first reading arrives ~30s into the session.
 * After that, readings update every ~5 seconds as new chunks arrive.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { io, Socket } from "socket.io-client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mic, MicOff, Square, AlertTriangle, Activity,
  Clock, Brain, Wifi, WifiOff,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmotionReading {
  offsetSeconds: number;
  arousal: number;
  valence: number;
  dominance: number;
  confidence: number;
  receivedAt: number; // wall-clock ms
}

interface LiveSessionProps {
  sessionId: number;
  clientName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_INTERVAL_MS = 5000;       // send a chunk every 5 seconds
const WINDOW_SECONDS    = 30;         // first reading after 30s of audio
const ESCALATION_AROUSAL   = 0.75;    // flag if arousal exceeds this
const ESCALATION_VALENCE   = 0.25;    // flag if valence drops below this
const ESCALATION_WINDOW    = 3;       // consecutive readings needed to trigger

// ─── Gauge Component ─────────────────────────────────────────────────────────
function EmotionGauge({
  label, value, color, description,
}: {
  label: string; value: number | null; color: string; description: string;
}) {
  const pct = value !== null ? Math.round(value * 100) : null;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = pct !== null ? (pct / 100) * circumference : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 96 96" className="sm:w-24 sm:h-24">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        <text x="48" y="52" textAnchor="middle" fontSize="18" fontWeight="700" fill={color}>
          {pct !== null ? `${pct}` : "—"}
        </text>
        {pct !== null && (
          <text x="48" y="64" textAnchor="middle" fontSize="9" fill="#9ca3af">%</text>
        )}
      </svg>
      <span className="text-sm font-semibold" style={{ color }}>{label}</span>
      <span className="text-xs text-muted-foreground text-center max-w-[90px]">{description}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveSession({ sessionId, clientName }: LiveSessionProps) {
  const [, navigate] = useLocation();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [bufferedSeconds, setBufferedSeconds] = useState(0);

  // Socket.io state
  const [socketConnected, setSocketConnected] = useState(false);

  // Emotion data
  const [readings, setReadings] = useState<EmotionReading[]>([]);
  const [latestReading, setLatestReading] = useState<EmotionReading | null>(null);
  const [escalationCount, setEscalationCount] = useState(0);
  const [escalationFired, setEscalationFired] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef        = useRef<Socket | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const chunkIndexRef    = useRef(0);
  const elapsedRef       = useRef(0);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // tRPC
  const saveReading  = trpc.emotions.saveReading.useMutation();
  const createAlert  = trpc.alerts.create.useMutation();
  const updateSession = trpc.sessions.update.useMutation();

  // ─── Socket.io Connection ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("join:session", String(sessionId));
      console.log("[LiveSession] Socket connected, joined session:", sessionId);
    });

    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("emotion:reading", (payload: {
      reading: { offset_seconds: number; arousal: number; valence: number; dominance: number; confidence: number };
      bufferedSeconds: number;
    }) => {
      const r = payload.reading;
      const reading: EmotionReading = {
        offsetSeconds: r.offset_seconds,
        arousal:       r.arousal,
        valence:       r.valence,
        dominance:     r.dominance,
        confidence:    r.confidence,
        receivedAt:    Date.now(),
      };

      setReadings(prev => [...prev, reading]);
      setLatestReading(reading);
      setBufferedSeconds(payload.bufferedSeconds ?? 0);

      // Persist to DB
      saveReading.mutate({
        sessionId,
        offsetSeconds: reading.offsetSeconds,
        arousal:       reading.arousal,
        valence:       reading.valence,
        dominance:     reading.dominance,
        confidence:    reading.confidence,
      });

      // Escalation detection
      checkEscalation(reading);
    });

    socketRef.current = socket;
    return () => {
      socket.emit("leave:session", String(sessionId));
      socket.disconnect();
    };
  }, [sessionId]);

  // ─── Escalation Detection ───────────────────────────────────────────────────
  const checkEscalation = useCallback((reading: EmotionReading) => {
    const isEscalated =
      reading.arousal > ESCALATION_AROUSAL ||
      reading.valence < ESCALATION_VALENCE;

    setEscalationCount(prev => {
      const next = isEscalated ? prev + 1 : 0;
      if (next >= ESCALATION_WINDOW && !escalationFired) {
        setEscalationFired(true);
        toast.warning("Escalation detected — sustained emotional distress pattern", {
          duration: 8000,
        });
        createAlert.mutate({
          sessionId,
          alertType: reading.arousal > ESCALATION_AROUSAL ? "high_arousal" : "low_valence",
          severity: "high",
          message: `Sustained escalation: arousal=${(reading.arousal * 100).toFixed(0)}%, valence=${(reading.valence * 100).toFixed(0)}%`,
        });
      }
      return next;
    });
  }, [createAlert, escalationFired, sessionId]);

  // ─── Recording Controls ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunkIndexRef.current = 0;
      elapsedRef.current = 0;

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(e => e + 1);
      }, 1000);

      // Send a chunk every CHUNK_INTERVAL_MS
      chunkTimerRef.current = setInterval(() => {
        if (recorder.state === "recording") {
          recorder.requestData(); // triggers ondataavailable
        }
      }, CHUNK_INTERVAL_MS);

      recorder.ondataavailable = async (e) => {
        if (!e.data || e.data.size < 100) return;

        const idx = chunkIndexRef.current++;
        const isFinal = recorder.state !== "recording";

        const formData = new FormData();
        formData.append("audio", e.data, `chunk-${idx}.webm`);
        formData.append("sessionId", String(sessionId));
        formData.append("chunkIndex", String(idx));
        formData.append("elapsed", String(elapsedRef.current));
        formData.append("mimeType", mimeType.split(";")[0]);
        formData.append("final", isFinal ? "true" : "false");

        try {
          const res = await fetch("/api/ser/chunk", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          setChunkCount(idx + 1);
          if (data.buffered_seconds !== undefined) {
            setBufferedSeconds(data.buffered_seconds);
          }
        } catch (err) {
          console.error("[LiveSession] Chunk upload error:", err);
        }
      };

      recorder.start();
      setIsRecording(true);
      toast.success("Recording started — first emotion reading in ~30 seconds");
    } catch (err) {
      toast.error("Microphone access denied. Please allow microphone permissions.");
      console.error("[LiveSession] getUserMedia error:", err);
    }
  }, [sessionId]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current)      clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Request final chunk
      recorder.requestData();
      recorder.stop();
    }

    streamRef.current?.getTracks().forEach(t => t.stop());

    // Clear server-side buffer
    await fetch("/api/ser/session-clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: String(sessionId) }),
    }).catch(() => {});

    // Update session status and duration
    await updateSession.mutateAsync({
      id: sessionId,
      status: "uploaded",
      durationSeconds: elapsedRef.current,
      escalationDetected: escalationFired,
    }).catch(() => {});

    setIsRecording(false);
    toast.success("Recording stopped. Navigating to session detail...");
    setTimeout(() => navigate(`/sessions/${sessionId}`), 1500);
  }, [sessionId, escalationFired, navigate]);

  // ─── Chart Data ─────────────────────────────────────────────────────────────
  const chartData = readings.map(r => ({
    time: `${Math.floor(r.offsetSeconds / 60)}:${String(Math.floor(r.offsetSeconds % 60)).padStart(2, "0")}`,
    arousal:   Math.round(r.arousal * 100),
    valence:   Math.round(r.valence * 100),
    dominance: Math.round(r.dominance * 100),
  }));

  // ─── Elapsed Formatting ─────────────────────────────────────────────────────
  const formatElapsed = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const warmupRemaining = Math.max(0, WINDOW_SECONDS - bufferedSeconds);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Live Session</h1>
          <p className="text-muted-foreground text-sm">{clientName} · Session #{sessionId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={socketConnected ? "default" : "destructive"} className="gap-1">
            {socketConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {socketConnected ? "Live" : "Offline"}
          </Badge>
          {escalationFired && (
            <Badge variant="destructive" className="gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" /> Escalation
            </Badge>
          )}
        </div>
      </div>

      {/* Controls + Status Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-col items-center gap-1">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <span className="text-2xl font-mono font-bold">{formatElapsed(elapsed)}</span>
            <span className="text-xs text-muted-foreground">Elapsed</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-col items-center gap-1">
            <Activity className="w-5 h-5 text-muted-foreground" />
            <span className="text-2xl font-mono font-bold">{chunkCount}</span>
            <span className="text-xs text-muted-foreground">Chunks sent</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-col items-center gap-1">
            <Brain className="w-5 h-5 text-muted-foreground" />
            <span className="text-2xl font-mono font-bold">{readings.length}</span>
            <span className="text-xs text-muted-foreground">Readings</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-col items-center gap-1">
            <div className={`w-3 h-3 rounded-full ${isRecording ? "bg-red-500 recording-indicator" : "bg-gray-300"}`} />
            <span className="text-sm font-semibold">{isRecording ? "Recording" : "Idle"}</span>
            <span className="text-xs text-muted-foreground">
              {isRecording && warmupRemaining > 0
                ? `First reading in ~${Math.ceil(warmupRemaining)}s`
                : isRecording
                ? "Analyzing live"
                : "Ready"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Live Gauges */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Current Emotion State</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-around py-2 gap-2">
            <EmotionGauge
              label="Arousal"
              value={latestReading?.arousal ?? null}
              color="oklch(0.6 0.2 25)"
              description="Energy / activation"
            />
            <EmotionGauge
              label="Valence"
              value={latestReading?.valence ?? null}
              color="oklch(0.5 0.18 145)"
              description="Positive / negative affect"
            />
            <EmotionGauge
              label="Dominance"
              value={latestReading?.dominance ?? null}
              color="oklch(0.5 0.18 270)"
              description="Control / confidence"
            />
          </div>
          {latestReading && (
            <p className="text-center text-xs text-muted-foreground mt-2">
              Confidence: {Math.round(latestReading.confidence * 100)}% ·
              Window offset: {latestReading.offsetSeconds.toFixed(1)}s
            </p>
          )}
          {!latestReading && isRecording && (
            <p className="text-center text-sm text-muted-foreground mt-4 animate-pulse">
              Accumulating audio… first reading after {WINDOW_SECONDS}s of speech
            </p>
          )}
          {!latestReading && !isRecording && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              Start recording to see live emotion data
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live Timeline Chart */}
      {readings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Live Emotion Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  formatter={(v: number) => [`${v}%`]}
                  labelFormatter={(l) => `Session time: ${l}`}
                />
                <Legend />
                <ReferenceLine y={75} stroke="oklch(0.6 0.2 25)" strokeDasharray="4 4"
                  label={{ value: "Arousal alert", fontSize: 10, fill: "oklch(0.6 0.2 25)" }} />
                <ReferenceLine y={25} stroke="oklch(0.5 0.18 145)" strokeDasharray="4 4"
                  label={{ value: "Valence alert", fontSize: 10, fill: "oklch(0.5 0.18 145)" }} />
                <Line type="monotone" dataKey="arousal" stroke="oklch(0.6 0.2 25)"
                  strokeWidth={2} dot={{ r: 3 }} name="Arousal" />
                <Line type="monotone" dataKey="valence" stroke="oklch(0.5 0.18 145)"
                  strokeWidth={2} dot={{ r: 3 }} name="Valence" />
                <Line type="monotone" dataKey="dominance" stroke="oklch(0.5 0.18 270)"
                  strokeWidth={2} dot={{ r: 3 }} name="Dominance" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Record / Stop Button */}
      <div className="flex justify-center gap-4">
        {!isRecording ? (
          <Button size="lg" onClick={startRecording} className="gap-2 px-8">
            <Mic className="w-5 h-5" /> Start Recording
          </Button>
        ) : (
          <Button size="lg" variant="destructive" onClick={stopRecording} className="gap-2 px-8">
            <Square className="w-4 h-4" /> Stop & Save Session
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate(`/sessions/${sessionId}`)}>
          View Session Detail
        </Button>
      </div>

      {/* Info note */}
      <p className="text-center text-xs text-muted-foreground">
        Audio is analyzed in {WINDOW_SECONDS}-second windows using the audEERING wav2vec2 model.
        Readings update every ~5 seconds. All data is encrypted in transit and stored securely.
      </p>
    </div>
  );
}
