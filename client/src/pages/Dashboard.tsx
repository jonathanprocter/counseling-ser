import { trpc } from "@/lib/trpc";
import { AlertTriangle, Brain, Calendar, ChevronRight, Clock, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { format } from "date-fns";

function EmotionBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    recording: { label: "Recording", className: "bg-blue-100 text-blue-700" },
    uploaded: { label: "Uploaded", className: "bg-yellow-100 text-yellow-700" },
    analyzing: { label: "Analyzing", className: "bg-purple-100 text-purple-700" },
    completed: { label: "Completed", className: "bg-green-100 text-green-700" },
    error: { label: "Error", className: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return <Badge className={`${s.className} text-xs font-medium`}>{s.label}</Badge>;
}

export default function Dashboard() {
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: recentSessions } = trpc.sessions.recent.useQuery({ limit: 5 });
  const { data: alerts } = trpc.alerts.list.useQuery({ acknowledged: false });

  const completedSessions = recentSessions?.filter((s) => s.status === "completed") ?? [];
  const avgArousal = completedSessions.length
    ? completedSessions.reduce((sum, s) => sum + (s.avgArousal ?? 0), 0) / completedSessions.length
    : null;
  const avgValence = completedSessions.length
    ? completedSessions.reduce((sum, s) => sum + (s.avgValence ?? 0), 0) / completedSessions.length
    : null;
  const avgDominance = completedSessions.length
    ? completedSessions.reduce((sum, s) => sum + (s.avgDominance ?? 0), 0) / completedSessions.length
    : null;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            Clinician
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Link href="/clients/new" className="hidden sm:block">
          <Button size="sm">
            <Users className="w-4 h-4 mr-2" />
            New Client
          </Button>
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{clients?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{recentSessions?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Recent Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Brain className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedSessions.length}</p>
                <p className="text-xs text-muted-foreground">Analyzed Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{alerts?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Recent Sessions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Sessions</CardTitle>
                <Link href="/clients">
                  <Button variant="ghost" size="sm" className="text-xs">
                    View all <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {!recentSessions || recentSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No sessions yet</p>
                  <p className="text-xs mt-1">Create a client to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSessions.map((session) => (
                    <Link key={session.id} href={`/sessions/${session.id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Brain className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            Session #{session.id} — {session.sessionType ?? "Session"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(session.sessionDate), "MMM d, yyyy")}
                            </span>
                            {session.durationSeconds && (
                              <span className="text-xs text-muted-foreground">
                                · {Math.round(session.durationSeconds / 60)}m
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {session.escalationDetected && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                          <StatusBadge status={session.status} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Emotion Overview */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Emotion Overview</CardTitle>
              <p className="text-xs text-muted-foreground">Average across recent sessions</p>
            </CardHeader>
            <CardContent>
              {avgArousal === null ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Brain className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No analyzed sessions yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <EmotionBar label="Arousal" value={avgArousal} color="oklch(0.6 0.2 25)" />
                  <EmotionBar label="Valence" value={avgValence!} color="oklch(0.5 0.18 145)" />
                  <EmotionBar label="Dominance" value={avgDominance!} color="oklch(0.5 0.18 270)" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts */}
          {alerts && alerts.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <CardTitle className="text-base text-red-700">Active Alerts</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alerts.slice(0, 3).map((alert) => (
                    <div key={alert.id} className={`alert-${alert.severity} p-2 rounded text-xs`}>
                      <p className="font-medium capitalize">{alert.alertType.replace(/_/g, " ")}</p>
                      <p className="text-muted-foreground mt-0.5">{alert.description}</p>
                    </div>
                  ))}
                  {alerts.length > 3 && (
                    <Link href="/alerts">
                      <Button variant="ghost" size="sm" className="w-full text-xs">
                        View all {alerts.length} alerts
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
