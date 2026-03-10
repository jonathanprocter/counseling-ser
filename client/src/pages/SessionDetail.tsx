import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Brain, ChevronDown, ChevronUp,
  Clock, FileText, Loader2, Mic, Sparkles, Wand2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";
import { format } from "date-fns";
import { Streamdown } from "streamdown";

function EmotionTimeline({ sessionId }: { sessionId: number }) {
  const { data: readings, isLoading } = trpc.emotions.getBySession.useQuery({ sessionId });

  if (isLoading) {
    return <div className="h-64 bg-muted rounded-lg animate-pulse" />;
  }

  if (!readings || readings.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No emotion data available</p>
        </div>
      </div>
    );
  }

  const chartData = readings.map((r) => ({
    time: Math.round(r.offsetSeconds),
    arousal: parseFloat((r.arousal * 100).toFixed(1)),
    valence: parseFloat((r.valence * 100).toFixed(1)),
    dominance: parseFloat((r.dominance * 100).toFixed(1)),
  }));

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 286.32)" />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            tick={{ fontSize: 11 }}
            label={{ value: "Time (mm:ss)", position: "insideBottom", offset: -2, fontSize: 11 }}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            width={40}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name.charAt(0).toUpperCase() + name.slice(1)]}
            labelFormatter={(label) => `Time: ${formatTime(label)}`}
          />
          <Legend />
          <ReferenceLine y={50} stroke="oklch(0.75 0.01 240)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="arousal" stroke="oklch(0.6 0.2 25)" strokeWidth={2} dot={false} name="Arousal" />
          <Line type="monotone" dataKey="valence" stroke="oklch(0.5 0.18 145)" strokeWidth={2} dot={false} name="Valence" />
          <Line type="monotone" dataKey="dominance" stroke="oklch(0.5 0.18 270)" strokeWidth={2} dot={false} name="Dominance" />
        </LineChart>
      </ResponsiveContainer>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Arousal", key: "arousal", color: "oklch(0.6 0.2 25)", bg: "bg-red-50" },
          { label: "Valence", key: "valence", color: "oklch(0.5 0.18 145)", bg: "bg-green-50" },
          { label: "Dominance", key: "dominance", color: "oklch(0.5 0.18 270)", bg: "bg-purple-50" },
        ].map(({ label, key, color, bg }) => {
          const vals = readings.map((r) => r[key as keyof typeof r] as number);
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const max = Math.max(...vals);
          const min = Math.min(...vals);
          return (
            <div key={key} className={`${bg} rounded-lg p-3`}>
              <p className="text-xs font-medium" style={{ color }}>{label}</p>
              <p className="text-xl font-bold mt-1" style={{ color }}>{Math.round(avg * 100)}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Range: {Math.round(min * 100)}%–{Math.round(max * 100)}%
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TranscriptPanel({ sessionId }: { sessionId: number }) {
  const { data: transcript, isLoading } = trpc.transcription.get.useQuery({ sessionId });
  const transcribe = trpc.transcription.transcribe.useMutation({
    onSuccess: () => toast.success("Transcription complete"),
    onError: (e) => toast.error(e.message),
  });
  const utils = trpc.useUtils();

  if (isLoading) return <div className="h-32 bg-muted rounded animate-pulse" />;

  if (!transcript || transcript.status === "error") {
    return (
      <div className="text-center py-8">
        <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground mb-3">No transcript available</p>
        <Button
          size="sm"
          onClick={() => transcribe.mutateAsync({ sessionId }).then(() => utils.transcription.get.invalidate({ sessionId }))}
          disabled={transcribe.isPending}
        >
          {transcribe.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Transcribing...</> : <><Mic className="w-4 h-4 mr-2" />Generate Transcript</>}
        </Button>
      </div>
    );
  }

  if (transcript.status === "processing") {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin mb-2" />
        <p className="text-sm text-muted-foreground">Transcription in progress...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{transcript.wordCount ?? 0} words</Badge>
          <Badge variant="secondary" className="text-xs">{transcript.language?.toUpperCase() ?? "EN"}</Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => transcribe.mutateAsync({ sessionId }).then(() => utils.transcription.get.invalidate({ sessionId }))}
          disabled={transcribe.isPending}
        >
          Retranscribe
        </Button>
      </div>
      <div className="bg-muted/30 rounded-lg p-4 max-h-80 overflow-y-auto">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{transcript.fullText}</p>
      </div>
    </div>
  );
}

function AISummaryPanel({ sessionId }: { sessionId: number }) {
  const { data: summary, isLoading } = trpc.aiSummary.get.useQuery({ sessionId });
  const generate = trpc.aiSummary.generate.useMutation({
    onSuccess: () => toast.success("AI summary generated"),
    onError: (e) => toast.error(e.message),
  });
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState<string | null>("clinicalSummary");

  if (isLoading) return <div className="h-32 bg-muted rounded animate-pulse" />;

  if (!summary || summary.status === "error") {
    return (
      <div className="text-center py-8">
        <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground mb-3">No AI summary yet</p>
        <Button
          size="sm"
          onClick={() => generate.mutateAsync({ sessionId }).then(() => utils.aiSummary.get.invalidate({ sessionId }))}
          disabled={generate.isPending}
        >
          {generate.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : <><Wand2 className="w-4 h-4 mr-2" />Generate AI Summary</>}
        </Button>
      </div>
    );
  }

  if (summary.status === "generating") {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin mb-2" />
        <p className="text-sm text-muted-foreground">Generating clinical summary...</p>
      </div>
    );
  }

  const sections = [
    { key: "clinicalSummary", title: "Clinical Summary", content: summary.clinicalSummary },
    { key: "emotionalThemes", title: "Emotional Themes", content: summary.emotionalThemes },
    { key: "interventionSuggestions", title: "Intervention Suggestions", content: summary.interventionSuggestions },
    { key: "progressNotes", title: "Progress Notes", content: summary.progressNotes },
    { key: "riskIndicators", title: "Risk Indicators", content: summary.riskIndicators },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">AI Clinical Analysis</span>
          {summary.generatedAt && (
            <span className="text-xs text-muted-foreground">
              Generated {format(new Date(summary.generatedAt), "MMM d, h:mm a")}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => generate.mutateAsync({ sessionId }).then(() => utils.aiSummary.get.invalidate({ sessionId }))}
          disabled={generate.isPending}
        >
          Regenerate
        </Button>
      </div>

      {sections.map(({ key, title, content }) => (
        <div key={key} className="border border-border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
            onClick={() => setExpanded(expanded === key ? null : key)}
          >
            <span>{title}</span>
            {expanded === key ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expanded === key && content && (
            <div className="px-4 pb-4 border-t border-border">
              <div className="mt-3 text-sm text-foreground prose prose-sm max-w-none">
                <Streamdown>{content}</Streamdown>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SessionDetail({ sessionId }: { sessionId: number }) {
  const { data: session, isLoading } = trpc.sessions.get.useQuery({ id: sessionId });
  const analyzeSession = trpc.emotions.analyzeSession.useMutation({
    onSuccess: () => {
      toast.success("Analysis complete");
      utils.sessions.get.invalidate({ id: sessionId });
      utils.emotions.getBySession.invalidate({ sessionId });
    },
    onError: (e) => toast.error(e.message),
  });
  const utils = trpc.useUtils();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-80 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    recording: "bg-blue-100 text-blue-700",
    uploaded: "bg-yellow-100 text-yellow-700",
    analyzing: "bg-purple-100 text-purple-700",
    completed: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/clients/${session.clientId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Client
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold">
              {format(new Date(session.sessionDate), "MMM d, yyyy")}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`${statusColors[session.status] ?? "bg-gray-100 text-gray-700"} text-xs`}>
                {session.status}
              </Badge>
              {session.sessionType && (
                <span className="text-sm text-muted-foreground">{session.sessionType}</span>
              )}
              {session.durationSeconds && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {Math.round(session.durationSeconds / 60)} min
                </span>
              )}
              {session.escalationDetected && (
                <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Escalation Detected
                </Badge>
              )}
            </div>
          </div>
        </div>
        {session.status === "uploaded" && (
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => analyzeSession.mutate({ sessionId })}
            disabled={analyzeSession.isPending}
          >
            {analyzeSession.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</>
            ) : (
              <><Brain className="w-4 h-4 mr-2" />Run Analysis</>
            )}
          </Button>
        )}
      </div>

      {/* Clinician Notes */}
      {session.clinicianNotes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Clinician Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{session.clinicianNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="timeline">Emotion Timeline</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="summary">AI Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Arousal · Valence · Dominance</CardTitle>
              <p className="text-xs text-muted-foreground">
                Continuous emotion measurements across the session duration
              </p>
            </CardHeader>
            <CardContent>
              <EmotionTimeline sessionId={sessionId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transcript" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session Transcript</CardTitle>
              <p className="text-xs text-muted-foreground">
                Whisper-powered transcription of the session audio
              </p>
            </CardHeader>
            <CardContent>
              <TranscriptPanel sessionId={sessionId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">AI Clinical Summary</CardTitle>
              <p className="text-xs text-muted-foreground">
                AI-generated clinical analysis combining emotion data and transcript
              </p>
            </CardHeader>
            <CardContent>
              <AISummaryPanel sessionId={sessionId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
