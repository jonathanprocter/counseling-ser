import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Mic, MicOff, Square, Upload, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { format } from "date-fns";

type RecordingState = "idle" | "recording" | "stopped";

export default function NewSession({ clientId }: { clientId: number }) {
  const [, navigate] = useLocation();
  const [sessionType, setSessionType] = useState("Individual Therapy");
  const [notes, setNotes] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const { data: client } = trpc.clients.get.useQuery({ id: clientId });
  const createSession = trpc.sessions.create.useMutation();
  const uploadAudio = trpc.sessions.uploadAudio.useMutation();
  const analyzeSession = trpc.emotions.analyzeSession.useMutation();
  const transcribeSession = trpc.transcription.transcribe.useMutation();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const duration = (Date.now() - startTimeRef.current) / 1000;
        setAudioDuration(duration);
        stream.getTracks().forEach((t) => t.stop());
      };

      // Create session in DB first
      const created = await createSession.mutateAsync({
        clientId,
        sessionDate: new Date().toISOString(),
        sessionType,
        clinicianNotes: notes,
      });
      setSessionId(created.id);

      recorder.start(1000);
      startTimeRef.current = Date.now();
      setRecordingState("recording");
      setElapsedSeconds(0);

      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err: any) {
      toast.error(`Microphone access denied: ${err.message}`);
    }
  }, [clientId, sessionType, notes, createSession]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecordingState("stopped");
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleUploadAndAnalyze = async () => {
    if (!audioBlob || !sessionId) return;
    setIsUploading(true);

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);

      // Upload audio
      await uploadAudio.mutateAsync({
        sessionId,
        audioBase64: base64,
        mimeType: audioBlob.type || "audio/webm",
        filename: `session-${sessionId}.webm`,
      });

      toast.success("Audio uploaded. Starting analysis...");
      setIsUploading(false);
      setIsAnalyzing(true);

      // Run SER analysis and transcription in parallel
      const results = await Promise.allSettled([
        analyzeSession.mutateAsync({ sessionId }),
        transcribeSession.mutateAsync({ sessionId }),
      ]);
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        toast.error("Session processing finished with errors. Check the session detail for status.");
        setIsAnalyzing(false);
        navigate(`/sessions/${sessionId}`);
        return;
      }

      toast.success("Session analyzed successfully!");
      setIsAnalyzing(false);
      navigate(`/sessions/${sessionId}`);
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">New Session</h1>
          {client && (
            <p className="text-muted-foreground text-sm">
              {client.firstName} {client.lastName} · {format(new Date(), "MMMM d, yyyy")}
            </p>
          )}
        </div>
      </div>

      {/* Session Setup */}
      {recordingState === "idle" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Session Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Session Type</Label>
              <Select value={sessionType} onValueChange={setSessionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual Therapy">Individual Therapy</SelectItem>
                  <SelectItem value="Group Therapy">Group Therapy</SelectItem>
                  <SelectItem value="Family Therapy">Family Therapy</SelectItem>
                  <SelectItem value="Couples Therapy">Couples Therapy</SelectItem>
                  <SelectItem value="Crisis Intervention">Crisis Intervention</SelectItem>
                  <SelectItem value="Intake Assessment">Intake Assessment</SelectItem>
                  <SelectItem value="Follow-up">Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pre-session Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes before the session begins..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recording Interface */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session Recording</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-5 py-4">
            {/* Recording indicator */}
            <div className="relative">
              <div
                className={`w-28 h-28 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all ${
                  recordingState === "recording"
                    ? "bg-red-100 border-4 border-red-400"
                    : recordingState === "stopped"
                    ? "bg-green-100 border-4 border-green-400"
                    : "bg-muted border-4 border-border"
                }`}
              >
                {recordingState === "recording" ? (
                  <div className="recording-indicator">
                    <Mic className="w-10 h-10 text-red-500" />
                  </div>
                ) : recordingState === "stopped" ? (
                  <MicOff className="w-10 h-10 text-green-600" />
                ) : (
                  <Mic className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
              {recordingState === "recording" && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full recording-indicator" />
              )}
            </div>

            {/* Timer */}
            <div className="text-center">
              {recordingState === "recording" && (
                <>
                  <p className="text-3xl font-mono font-bold text-red-600">{formatTime(elapsedSeconds)}</p>
                  <p className="text-sm text-muted-foreground mt-1">Recording in progress...</p>
                </>
              )}
              {recordingState === "stopped" && (
                <>
                  <p className="text-3xl font-mono font-bold text-green-600">{formatTime(Math.round(audioDuration))}</p>
                  <p className="text-sm text-muted-foreground mt-1">Recording complete</p>
                </>
              )}
              {recordingState === "idle" && (
                <p className="text-sm text-muted-foreground">Press record to begin the session</p>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3 w-full px-2">
              {recordingState === "idle" && (
                <div className="flex flex-col gap-3 items-center">
                  <Button
                    size="lg"
                    className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto px-8 min-h-[52px]"
                    onClick={startRecording}
                    disabled={createSession.isPending}
                  >
                    <Mic className="w-5 h-5 mr-2" />
                    {createSession.isPending ? "Starting..." : "Record & Analyze Later"}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-blue-400 text-blue-600 hover:bg-blue-50 w-full sm:w-auto px-8 min-h-[52px]"
                    onClick={async () => {
                      try {
                        const created = await createSession.mutateAsync({
                          clientId,
                          sessionDate: new Date().toISOString(),
                          sessionType,
                          clinicianNotes: notes,
                        });
                        navigate(`/sessions/${created.id}/live`);
                      } catch (err: any) {
                        toast.error(`Could not create session: ${err.message}`);
                      }
                    }}
                    disabled={createSession.isPending}
                  >
                    <Activity className="w-5 h-5 mr-2" />
                    Live Emotion Monitoring
                  </Button>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Live mode streams audio in 30-second windows and displays arousal, valence &amp; dominance in real time during the session.
                  </p>
                </div>
              )}
              {recordingState === "recording" && (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 w-full sm:w-auto px-8 min-h-[52px]"
                  onClick={stopRecording}
                >
                  <Square className="w-5 h-5 mr-2" />
                  Stop Recording
                </Button>
              )}
              {recordingState === "stopped" && (
                <Button
                  size="lg"
                  className="w-full sm:w-auto px-8 min-h-[52px]"
                  onClick={handleUploadAndAnalyze}
                  disabled={isUploading || isAnalyzing}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  {isUploading ? "Uploading..." : isAnalyzing ? "Analyzing..." : "Upload & Analyze"}
                </Button>
              )}
            </div>

            {(isUploading || isAnalyzing) && (
              <div className="w-full max-w-xs">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse w-3/4" />
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  {isUploading ? "Uploading audio to secure storage..." : "Running emotion analysis (this may take a few minutes)..."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-blue-50/50 border-blue-200">
        <CardContent className="pt-4">
          <p className="text-xs text-blue-800 font-medium mb-1">Recording Guidelines</p>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Ensure the client has signed the audio recording consent form before starting</li>
            <li>• Place the device in a central location for optimal audio capture</li>
            <li>• After stopping, the recording will be uploaded and analyzed for arousal, valence, and dominance</li>
            <li>• Analysis typically takes 1–3 minutes depending on session length</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
