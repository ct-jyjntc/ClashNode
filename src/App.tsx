import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AppShell } from "@/app/shell";
import { useAppBootstrap } from "@/shared/hooks/use-app-state";
import { DashboardPage } from "@/features/dashboard/page";
import { ProxiesPage } from "@/features/proxies/page";
import { ProfilesPage } from "@/features/profiles/page";
import { ProvidersPage } from "@/features/providers/page";
import { RequestsPage } from "@/features/requests/page";
import { ConnectionsPage } from "@/features/connections/page";
import { RulesPage } from "@/features/rules/page";
import { ResourcesPage } from "@/features/resources/page";
import { ScriptsPage } from "@/features/scripts/page";
import { LogsPage } from "@/features/logs/page";
import { SettingsPage } from "@/features/settings/page";
import { I18nProvider, useI18n } from "@/shared/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const Router =
  typeof window !== "undefined" && window.location.protocol === "file:"
    ? HashRouter
    : BrowserRouter;

function Bootstrapped() {
  const { ready, bridgeOk } = useAppBootstrap();
  const { t } = useI18n();

  if (!bridgeOk) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-sm font-medium">{t.common.bridgeTitle}</p>
        <p className="max-w-md text-xs text-muted-foreground">
          {t.common.bridgeBody}
        </p>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-xs text-muted-foreground">
        {t.common.loading}
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="proxies" element={<ProxiesPage />} />
        <Route path="profiles" element={<ProfilesPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="scripts" element={<ScriptsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <I18nProvider>
          <Router>
            <Bootstrapped />
          </Router>
          <Toaster
            position="top-right"
            // Below the 40px drag strip so the toast itself isn't under drag
            offset={{ top: 48 }}
            richColors
            closeButton
            toastOptions={{
              className: "text-xs titlebar-no-drag",
            }}
            className="titlebar-no-drag"
          />
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
