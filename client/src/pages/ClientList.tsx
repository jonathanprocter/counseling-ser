import { trpc } from "@/lib/trpc";
import { Brain, ChevronRight, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function ClientList() {
  const [query, setQuery] = useState("");
  const { data: clients, isLoading } = trpc.clients.list.useQuery();
  const { data: searchResults } = trpc.clients.search.useQuery(
    { query },
    { enabled: query.length > 1 }
  );

  const displayClients = query.length > 1 ? searchResults : clients;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {clients?.length ?? 0} active client{clients?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/clients/new">
          <Button size="sm" className="shrink-0">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">New Client</span>
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search clients by name or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Client Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !displayClients || displayClients.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-medium text-foreground">
            {query ? "No clients found" : "No clients yet"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {query ? "Try a different search term" : "Add your first client to get started"}
          </p>
          {!query && (
            <Link href="/clients/new">
              <Button className="mt-4" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add First Client
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {displayClients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <div className="bg-card border border-border rounded-xl p-4 sm:p-5 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group active:scale-[0.98]">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {client.firstName.charAt(0)}{client.lastName.charAt(0)}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-semibold text-foreground">
                  {client.firstName} {client.lastName}
                </h3>
                {client.diagnosis && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{client.diagnosis}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  {client.consentSigned && (
                    <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">
                      Consent Signed
                    </Badge>
                  )}
                  {client.hipaaAcknowledged && (
                    <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                      HIPAA
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Added {format(new Date(client.createdAt), "MMM d, yyyy")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
