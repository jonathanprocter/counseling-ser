/**
 * LiveSessionPage — wrapper that resolves the session/client context
 * and renders the LiveSession real-time emotion monitoring component.
 */
import { trpc } from "@/lib/trpc";
import LiveSession from "./LiveSession";
import { Loader2, AlertCircle } from "lucide-react";

interface Props {
  sessionId: number;
}

export default function LiveSessionPage({ sessionId }: Props) {
  const { data: session, isLoading: sessionLoading, error: sessionError } = trpc.sessions.get.useQuery({ id: sessionId });
  const { data: client, isLoading: clientLoading } = trpc.clients.get.useQuery(
    { id: session?.clientId ?? 0 },
    { enabled: !!session?.clientId }
  );

  const isLoading = sessionLoading || clientLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-destructive">
        <AlertCircle className="w-6 h-6" />
        <span>Session not found or access denied.</span>
      </div>
    );
  }

  const clientName = client ? `${client.firstName} ${client.lastName}` : `Client #${session.clientId}`;

  return (
    <LiveSession
      sessionId={sessionId}
      clientName={clientName}
    />
  );
}
