import { trpc } from "@/lib/trpc";
import { ArrowLeft, Brain, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar
} from "recharts";
import { format } from "date-fns";

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

export default function LongitudinalView({ clientId }: { clientId: number }) {
  const { data: client } = trpc.clients.get.useQuery({ id: clientId });
  const { data: sessions, isLoading } = trpc.sessions.listByClient.useQuery({ clientId });

  const completedSessions = sessions?.filter((s) => s.status === "completed" && s.avgArousal !== null) ?? [];

  const chartData = completedSessions.map((s, i) => ({
    session: `S${i + 1}`,
    date: format(new Date(s.sessionDate), "MMM d"),
    arousal: parseFloat(((s.avgArousal ?? 0) * 100).toFixed(1)),
    valence: parseFloat(((s.avgValence ?? 0) * 100).toFixed(1)),
    dominance: parseFloat(((s.avgDominance ?? 0) * 100).toFixed(1)),
    escalation: s.escalationDetected ? 1 : 0,
  }));

  const getTrend = (key: "arousal" | "valence" | "dominance"): "up" | "down" | "stable" => {
    if (chartData.length < 2) return "stable";
    const first = chartData[0][key];
    const last = chartData[chartData.length - 1][key];
    const diff = last - first;
    if (diff > 5) return "up";
    if (diff < -5) return "down";
    return "stable";
  };

  const getAvg = (key: "arousal" | "valence" | "dominance") => {
    if (!chartData.length) return 0;
    return Math.round(chartData.reduce((s, r) => s + r[key], 0) / chartData.length);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Client
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Longitudinal Tracking</h1>
          {client && (
            <p className="text-muted-foreground text-sm">
              {client.firstName} {client.lastName} · {completedSessions.length} analyzed sessions
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-64 bg-muted rounded-xl animate-pulse" />
          <div className="h-48 bg-muted rounded-xl animate-pulse" />
        </div>
      ) : completedSessions.length < 2 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Brain className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-medium">Not enough data yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              At least 2 analyzed sessions are needed for longitudinal tracking.
            </p>
            <Link href={`/clients/${clientId}/sessions/new`}>
              <Button className="mt-4" size="sm">Record a Session</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Trend Summary Cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              { key: "arousal" as const, label: "Arousal", color: "oklch(0.6 0.2 25)", bg: "bg-red-50" },
              { key: "valence" as const, label: "Valence", color: "oklch(0.5 0.18 145)", bg: "bg-green-50" },
              { key: "dominance" as const, label: "Dominance", color: "oklch(0.5 0.18 270)", bg: "bg-purple-50" },
            ].map(({ key, label, color, bg }) => (
              <Card key={key} className={`${bg} border-0`}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color }}>{label}</span>
                    <TrendIcon trend={getTrend(key)} />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold" style={{ color }}>{getAvg(key)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {chartData[0][key]}% → {chartData[chartData.length - 1][key]}%
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main Trend Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Emotion Trends Across Sessions</CardTitle>
              <p className="text-xs text-muted-foreground">Average arousal, valence, and dominance per session</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 286.32)" />
                  <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value}%`, name.charAt(0).toUpperCase() + name.slice(1)]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item ? `${label} — ${item.date}` : label;
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="arousal" stroke="oklch(0.6 0.2 25)" strokeWidth={2.5} dot={{ r: 4 }} name="Arousal" />
                  <Line type="monotone" dataKey="valence" stroke="oklch(0.5 0.18 145)" strokeWidth={2.5} dot={{ r: 4 }} name="Valence" />
                  <Line type="monotone" dataKey="dominance" stroke="oklch(0.5 0.18 270)" strokeWidth={2.5} dot={{ r: 4 }} name="Dominance" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Session-by-session bar comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session Comparison</CardTitle>
              <p className="text-xs text-muted-foreground">Side-by-side emotion scores per session</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 286.32)" />
                  <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={40} />
                  <Tooltip formatter={(value: number, name: string) => [`${value}%`, name.charAt(0).toUpperCase() + name.slice(1)]} />
                  <Legend />
                  <Bar dataKey="arousal" fill="oklch(0.6 0.2 25)" name="Arousal" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="valence" fill="oklch(0.5 0.18 145)" name="Valence" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="dominance" fill="oklch(0.5 0.18 270)" name="Dominance" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Session Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Session</th>
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Date</th>
                      <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Arousal</th>
                      <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Valence</th>
                      <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Dominance</th>
                      <th className="text-center py-2 text-muted-foreground font-medium">Escalation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedSessions.map((s, i) => (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-4">
                          <Link href={`/sessions/${s.id}`}>
                            <span className="text-primary hover:underline cursor-pointer">S{i + 1}</span>
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {format(new Date(s.sessionDate), "MMM d, yyyy")}
                        </td>
                        <td className="py-2 pr-4 text-right font-medium" style={{ color: "oklch(0.6 0.2 25)" }}>
                          {Math.round((s.avgArousal ?? 0) * 100)}%
                        </td>
                        <td className="py-2 pr-4 text-right font-medium" style={{ color: "oklch(0.5 0.18 145)" }}>
                          {Math.round((s.avgValence ?? 0) * 100)}%
                        </td>
                        <td className="py-2 pr-4 text-right font-medium" style={{ color: "oklch(0.5 0.18 270)" }}>
                          {Math.round((s.avgDominance ?? 0) * 100)}%
                        </td>
                        <td className="py-2 text-center">
                          {s.escalationDetected ? "⚠️" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
