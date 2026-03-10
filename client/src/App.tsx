import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ClinicalLayout from "./components/ClinicalLayout";
import Dashboard from "./pages/Dashboard";
import ClientList from "./pages/ClientList";
import ClientProfile from "./pages/ClientProfile";
import NewClient from "./pages/NewClient";
import SessionDetail from "./pages/SessionDetail";
import NewSession from "./pages/NewSession";
import LongitudinalView from "./pages/LongitudinalView";
import AlertsPage from "./pages/AlertsPage";
import LiveSessionPage from "./pages/LiveSessionPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ClinicalLayout><Dashboard /></ClinicalLayout>} />
      <Route path="/clients" component={() => <ClinicalLayout><ClientList /></ClinicalLayout>} />
      <Route path="/clients/new" component={() => <ClinicalLayout><NewClient /></ClinicalLayout>} />
      <Route path="/clients/:id" component={({ params }) => <ClinicalLayout><ClientProfile clientId={Number(params.id)} /></ClinicalLayout>} />
      <Route path="/clients/:clientId/sessions/new" component={({ params }) => <ClinicalLayout><NewSession clientId={Number(params.clientId)} /></ClinicalLayout>} />
      <Route path="/sessions/:id" component={({ params }) => <ClinicalLayout><SessionDetail sessionId={Number(params.id)} /></ClinicalLayout>} />
      <Route path="/clients/:clientId/longitudinal" component={({ params }) => <ClinicalLayout><LongitudinalView clientId={Number(params.clientId)} /></ClinicalLayout>} />
      <Route path="/alerts" component={() => <ClinicalLayout><AlertsPage /></ClinicalLayout>} />
      <Route path="/sessions/:id/live" component={({ params }) => <ClinicalLayout><LiveSessionPage sessionId={Number(params.id)} /></ClinicalLayout>} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
