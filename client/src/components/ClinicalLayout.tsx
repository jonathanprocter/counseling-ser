import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Brain,
  Home,
  Menu,
  Plus,
  Users,
  X,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "./ui/badge";

interface NavItem {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}

function SidebarItem({ href, icon, label, badge, onClick }: NavItem & { onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));
  return (
    <Link href={href} onClick={onClick}>
      <div className={`clinical-sidebar-item ${isActive ? "active" : ""}`}>
        <span className="w-4 h-4 shrink-0">{icon}</span>
        <span className="flex-1">{label}</span>
        {badge !== undefined && badge > 0 && (
          <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">
            {badge}
          </Badge>
        )}
      </div>
    </Link>
  );
}

function BottomNavItem({ href, icon, label, badge }: NavItem) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));
  return (
    <Link href={href}>
      <div className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors relative ${
        isActive
          ? "text-primary"
          : "text-muted-foreground"
      }`}>
        <span className="w-6 h-6">{icon}</span>
        <span className="text-[10px] font-medium">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="absolute top-1 right-2 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function ClinicalLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: alerts } = trpc.alerts.list.useQuery(
    { acknowledged: false },
    { refetchInterval: 30000 }
  );

  const unreadAlerts = alerts?.length ?? 0;

  const navItems: NavItem[] = [
    { href: "/", icon: <Home className="w-4 h-4" />, label: "Dashboard" },
    { href: "/clients", icon: <Users className="w-4 h-4" />, label: "Clients" },
    { href: "/alerts", icon: <AlertTriangle className="w-4 h-4" />, label: "Alerts", badge: unreadAlerts },
  ];

  const bottomNavItems: NavItem[] = [
    { href: "/", icon: <Home className="w-5 h-5" />, label: "Home" },
    { href: "/clients", icon: <Users className="w-5 h-5" />, label: "Clients" },
    { href: "/clients/new", icon: <Plus className="w-5 h-5" />, label: "New" },
    { href: "/alerts", icon: <AlertTriangle className="w-5 h-5" />, label: "Alerts", badge: unreadAlerts },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop Sidebar (md+) ─────────────────────────────── */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col h-full"
        style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}>
        {/* Logo */}
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--sidebar-foreground)" }}>ClinicalVoice</p>
              <p className="text-xs" style={{ color: "oklch(0.6 0.01 240)" }}>Emotion Analytics</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-medium px-3 mb-2" style={{ color: "oklch(0.55 0.01 240)" }}>
            NAVIGATION
          </p>
          {navItems.map((item) => (
            <SidebarItem key={item.href} {...item} />
          ))}

          <div className="pt-4">
            <p className="text-xs font-medium px-3 mb-2" style={{ color: "oklch(0.55 0.01 240)" }}>
              QUICK ACTIONS
            </p>
            <Link href="/clients/new">
              <div className="clinical-sidebar-item">
                <Users className="w-4 h-4" />
                <span>New Client</span>
              </div>
            </Link>
          </div>

          <SerStatusBadge />
        </nav>

        {/* User Profile */}
        <div className="px-3 py-4 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">
                C
                  </span>
                </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "var(--sidebar-foreground)" }}>
                Clinician
              </p>
              <p className="text-xs truncate" style={{ color: "oklch(0.6 0.01 240)" }}>
                Local session
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile Slide-over Sidebar (sm) ───────────────────── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] flex flex-col h-full shadow-2xl"
            style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}>
            {/* Header */}
            <div className="px-4 py-5 border-b flex items-center justify-between"
              style={{ borderColor: "var(--sidebar-border)", paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Brain className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--sidebar-foreground)" }}>ClinicalVoice</p>
                  <p className="text-xs" style={{ color: "oklch(0.6 0.01 240)" }}>Emotion Analytics</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" style={{ color: "var(--sidebar-foreground)" }} />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <p className="text-xs font-medium px-3 mb-2" style={{ color: "oklch(0.55 0.01 240)" }}>
                NAVIGATION
              </p>
              {navItems.map((item) => (
                <SidebarItem key={item.href} {...item} onClick={() => setSidebarOpen(false)} />
              ))}

              <div className="pt-4">
                <p className="text-xs font-medium px-3 mb-2" style={{ color: "oklch(0.55 0.01 240)" }}>
                  QUICK ACTIONS
                </p>
                <Link href="/clients/new" onClick={() => setSidebarOpen(false)}>
                  <div className="clinical-sidebar-item">
                    <Users className="w-4 h-4" />
                    <span>New Client</span>
                  </div>
                </Link>
              </div>

              <SerStatusBadge />
            </nav>

            {/* User Profile */}
            <div className="px-3 py-4 border-t" style={{
              borderColor: "var(--sidebar-border)",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))"
            }}>
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">
                    C
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--sidebar-foreground)" }}>
                    Clinician
                  </p>
                  <p className="text-xs truncate" style={{ color: "oklch(0.6 0.01 240)" }}>
                    Local session
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content Area ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Top Bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-background shrink-0"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-lg hover:bg-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">ClinicalVoice</span>
          </div>
          <Link href="/clients/new">
            <button className="p-2 -mr-1 rounded-lg hover:bg-muted transition-colors" aria-label="New client">
              <Plus className="w-5 h-5 text-foreground" />
            </button>
          </Link>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto"
          style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
          {children}
        </main>

        {/* ── Mobile Bottom Navigation Bar ─────────────────── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t flex items-center justify-around"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
            boxShadow: "0 -1px 12px rgba(0,0,0,0.08)"
          }}>
          {bottomNavItems.map((item) => (
            <BottomNavItem key={item.href} {...item} />
          ))}
        </nav>
      </div>
    </div>
  );
}

function SerStatusBadge() {
  const { data: health } = trpc.ser.health.useQuery(undefined, {
    refetchInterval: 60000,
    retry: false,
  });

  const isOnline = health?.status === "ready" || health?.model_loaded === true;

  return (
    <div className="mt-4 mx-1 px-3 py-2 rounded-md" style={{ background: "oklch(0.15 0.02 240)" }}>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-400" : "bg-yellow-400"}`} />
        <span className="text-xs" style={{ color: "oklch(0.65 0.01 240)" }}>
          SER Engine: {isOnline ? "Online" : "Loading..."}
        </span>
      </div>
      {isOnline && (
        <p className="text-xs mt-0.5" style={{ color: "oklch(0.5 0.01 240)" }}>
          wav2vec2 · 3-dim
        </p>
      )}
    </div>
  );
}
