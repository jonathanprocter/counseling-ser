import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, BarChart3, Brain, Calendar, Clock, Edit, Plus, Shield } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

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

function EmotionMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold" style={{ color }}>{Math.round(value * 100)}%</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function ClientProfile({ clientId }: { clientId: number }) {
  const { data: client, isLoading } = trpc.clients.get.useQuery({ id: clientId });
  const { data: sessions } = trpc.sessions.listByClient.useQuery({ clientId });
  const utils = trpc.useUtils();

  const updateClient = trpc.clients.update.useMutation({
    onSuccess: () => {
      toast.success("Client updated");
      utils.clients.get.invalidate({ id: clientId });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Client not found</p>
        <Link href="/clients"><Button variant="ghost" className="mt-2">Back to Clients</Button></Link>
      </div>
    );
  }

  const completedSessions = sessions?.filter((s) => s.status === "completed") ?? [];
  const avgArousal = completedSessions.length
    ? completedSessions.reduce((s, r) => s + (r.avgArousal ?? 0), 0) / completedSessions.length : null;
  const avgValence = completedSessions.length
    ? completedSessions.reduce((s, r) => s + (r.avgValence ?? 0), 0) / completedSessions.length : null;
  const avgDominance = completedSessions.length
    ? completedSessions.reduce((s, r) => s + (r.avgDominance ?? 0), 0) / completedSessions.length : null;
  const escalationCount = sessions?.filter((s) => s.escalationDetected).length ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/clients">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Clients
            </Button>
          </Link>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">
              {client.firstName.charAt(0)}{client.lastName.charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold">{client.firstName} {client.lastName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {client.diagnosis && <span className="text-sm text-muted-foreground">{client.diagnosis}</span>}
              {client.consentSigned && (
                <Badge className="bg-green-50 text-green-700 text-xs">Consent Signed</Badge>
              )}
              {client.hipaaAcknowledged && (
                <Badge className="bg-blue-50 text-blue-700 text-xs">HIPAA</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Link href={`/clients/${clientId}/longitudinal`}>
            <Button variant="outline" size="sm">
              <BarChart3 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Longitudinal View</span>
            </Button>
          </Link>
          <Link href={`/clients/${clientId}/sessions/new`}>
            <Button size="sm">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Session</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left: Client Details */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Client Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {client.dateOfBirth && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date of Birth</span>
                  <span>{client.dateOfBirth}</span>
                </div>
              )}
              {client.gender && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gender</span>
                  <span>{client.gender}</span>
                </div>
              )}
              {client.pronouns && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pronouns</span>
                  <span>{client.pronouns}</span>
                </div>
              )}
              {client.email && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="truncate ml-2">{client.email}</span>
                </div>
              )}
              {client.phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{client.phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Since</span>
                <span>{format(new Date(client.createdAt), "MMM d, yyyy")}</span>
              </div>
            </CardContent>
          </Card>

          {client.treatmentGoals && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Treatment Goals</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{client.treatmentGoals}</p>
              </CardContent>
            </Card>
          )}

          {/* Emotion Summary */}
          {avgArousal !== null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Emotion Summary</CardTitle>
                <p className="text-xs text-muted-foreground">Avg across {completedSessions.length} sessions</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <EmotionMini label="Arousal" value={avgArousal} color="oklch(0.6 0.2 25)" />
                  <EmotionMini label="Valence" value={avgValence!} color="oklch(0.5 0.18 145)" />
                  <EmotionMini label="Dominance" value={avgDominance!} color="oklch(0.5 0.18 270)" />
                </div>
                {escalationCount > 0 && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-xs text-red-700">
                      {escalationCount} session{escalationCount !== 1 ? "s" : ""} with escalation detected
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Sessions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Sessions ({sessions?.length ?? 0})</CardTitle>
                <Link href={`/clients/${clientId}/sessions/new`}>
                  <Button size="sm" variant="outline">
                    <Plus className="w-3 h-3 mr-1" />
                    New Session
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {!sessions || sessions.length === 0 ? (
                <div className="text-center py-10">
                  <Calendar className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No sessions yet</p>
                  <Link href={`/clients/${clientId}/sessions/new`}>
                    <Button size="sm" className="mt-3">Start First Session</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <Link key={session.id} href={`/sessions/${session.id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 active:bg-muted transition-colors cursor-pointer border border-transparent hover:border-border">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Brain className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              {format(new Date(session.sessionDate), "MMMM d, yyyy")}
                            </p>
                            {session.sessionType && (
                              <span className="text-xs text-muted-foreground">· {session.sessionType}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {session.durationSeconds && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {Math.round(session.durationSeconds / 60)}m
                              </span>
                            )}
                            {session.avgArousal !== null && session.avgArousal !== undefined && (
                              <span className="text-xs text-muted-foreground hidden sm:inline">
                                A:{Math.round(session.avgArousal * 100)}% V:{Math.round((session.avgValence ?? 0) * 100)}% D:{Math.round((session.avgDominance ?? 0) * 100)}%
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
      </div>
    </div>
  );
}
