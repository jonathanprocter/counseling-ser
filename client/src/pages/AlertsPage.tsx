import { trpc } from "@/lib/trpc";
import { AlertTriangle, Bell, BellOff, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

const severityConfig: Record<string, { label: string; className: string; icon: string }> = {
  critical: { label: "Critical", className: "bg-red-100 text-red-800 border-red-200", icon: "🔴" },
  high: { label: "High", className: "bg-orange-100 text-orange-800 border-orange-200", icon: "🟠" },
  medium: { label: "Medium", className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: "🟡" },
  low: { label: "Low", className: "bg-blue-100 text-blue-800 border-blue-200", icon: "🔵" },
};

const alertTypeLabels: Record<string, string> = {
  high_arousal: "Sustained High Arousal",
  low_valence: "Prolonged Negative Valence",
  valence_drop: "Sudden Valence Drop",
  escalation_pattern: "Escalation Pattern",
  crisis_indicator: "Crisis Indicator",
};

export default function AlertsPage() {
  const { data: activeAlerts, isLoading: loadingActive } = trpc.alerts.list.useQuery({ acknowledged: false });
  const { data: resolvedAlerts, isLoading: loadingResolved } = trpc.alerts.list.useQuery({ acknowledged: true });
  const acknowledgeAlert = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged");
      utils.alerts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const utils = trpc.useUtils();

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Alerts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Emotional escalation notifications requiring clinician attention
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeAlerts && activeAlerts.length > 0 && (
            <Badge className="bg-red-100 text-red-700 text-sm px-3 py-1">
              {activeAlerts.length} active
            </Badge>
          )}
        </div>
      </div>

      {/* Active Alerts */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-red-500" />
          <h2 className="font-semibold">Active Alerts</h2>
          {activeAlerts && activeAlerts.length > 0 && (
            <Badge className="bg-red-100 text-red-700 text-xs">{activeAlerts.length}</Badge>
          )}
        </div>

        {loadingActive ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : !activeAlerts || activeAlerts.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <BellOff className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No active alerts</p>
              <p className="text-xs text-muted-foreground mt-1">
                Alerts are generated automatically when escalation patterns are detected in session analysis
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((alert) => {
              const sev = severityConfig[alert.severity] ?? severityConfig.medium;
              return (
                <Card key={alert.id} className={`border ${sev.className}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5">{sev.icon}</span>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">
                              {alertTypeLabels[alert.alertType] ?? alert.alertType}
                            </span>
                            <Badge className={`${sev.className} text-xs border`}>{sev.label}</Badge>
                          </div>
                          <p className="text-sm text-foreground">{alert.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(alert.createdAt), "MMM d, h:mm a")}
                            </span>
                            {alert.sessionId && (
                              <Link href={`/sessions/${alert.sessionId}`}>
                                <span className="text-primary hover:underline cursor-pointer">
                                  View Session →
                                </span>
                              </Link>
                            )}
                          </div>
                          {alert.offsetSeconds !== null && alert.offsetSeconds !== undefined && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Detected at: {Math.floor(alert.offsetSeconds / 60)}m {Math.round(alert.offsetSeconds % 60)}s into session
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 w-full sm:w-auto min-h-[40px]"
                        onClick={() => acknowledgeAlert.mutate({ id: alert.id })}
                        disabled={acknowledgeAlert.isPending}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Acknowledge
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Resolved Alerts */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Check className="w-4 h-4 text-green-600" />
          <h2 className="font-semibold text-muted-foreground">Acknowledged Alerts</h2>
          {resolvedAlerts && resolvedAlerts.length > 0 && (
            <Badge variant="secondary" className="text-xs">{resolvedAlerts.length}</Badge>
          )}
        </div>

        {loadingResolved ? (
          <div className="h-24 bg-muted rounded-xl animate-pulse" />
        ) : !resolvedAlerts || resolvedAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No acknowledged alerts yet.</p>
        ) : (
          <div className="space-y-2">
            {resolvedAlerts.slice(0, 10).map((alert) => {
              const sev = severityConfig[alert.severity] ?? severityConfig.medium;
              return (
                <div key={alert.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg opacity-70">
                  <span className="text-sm">{sev.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {alertTypeLabels[alert.alertType] ?? alert.alertType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(alert.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">Acknowledged</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alert Legend */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Alert Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-red-500" /> Sustained High Arousal: arousal &gt; 75% for extended period</div>
            <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-orange-500" /> Prolonged Negative Valence: valence &lt; 25% sustained</div>
            <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-yellow-500" /> Sudden Valence Drop: rapid decrease in positive affect</div>
            <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-purple-500" /> Crisis Indicator: combined high arousal + very low valence</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
