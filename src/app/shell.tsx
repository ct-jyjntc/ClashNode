import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  FileText,
  Globe2,
  LayoutDashboard,
  ListTree,
  Network,
  PanelLeft,
  PanelLeftClose,
  Settings2,
  Waypoints,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { useI18n } from "@/shared/i18n";

const STORAGE_KEY = "clashnode.sidebarCollapsed";

/** Top inset for traffic lights + window drag (no visible bar). */
const TOP_SAFE = 40;
/** macOS traffic lights occupy ~0–70px; controls start after that. */
const LIGHTS_PAD = 78;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const core = useAppStore((s) => s.core);
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const width = collapsed ? 68 : 200;
  const running = core?.status === "running";

  const nav = [
    { to: "/", label: t.nav.dashboard, icon: LayoutDashboard },
    { to: "/proxies", label: t.nav.proxies, icon: Waypoints },
    { to: "/profiles", label: t.nav.profiles, icon: Globe2 },
    { to: "/connections", label: t.nav.connections, icon: Network },
    { to: "/rules", label: t.nav.rules, icon: ListTree },
    { to: "/logs", label: t.nav.logs, icon: FileText },
    { to: "/settings", label: t.nav.settings, icon: Settings2 },
  ] as const;

  const toggleBtn = (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={() => setCollapsed((v) => !v)}
      aria-label={collapsed ? t.shell.expand : t.shell.collapse}
    >
      {collapsed ? (
        <PanelLeft className="size-4" strokeWidth={1.8} />
      ) : (
        <PanelLeftClose className="size-4" strokeWidth={1.8} />
      )}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-screen bg-background">
        {/*
          Sidebar must allow overflow so the expand control can sit past the
          68px rail (after traffic lights) without being clipped.
        */}
        <aside
          className="fixed inset-y-0 left-0 z-40 flex h-screen flex-col bg-sidebar transition-[width] duration-200 ease-out"
          style={{ width, overflow: "visible" }}
        >
          {/*
            Top row: no-drag control cluster (real hit target) + drag remainder.
            Never put drag on a parent that wraps the toggle button.
          */}
          <div
            className="flex shrink-0"
            style={{ height: TOP_SAFE }}
          >
            <div
              className="titlebar-no-drag flex h-full shrink-0 items-center gap-1"
              style={{
                // When collapsed, extend past rail so button stays after lights
                paddingLeft: LIGHTS_PAD,
                minWidth: LIGHTS_PAD + 36,
              }}
            >
              {toggleBtn}
              {!collapsed ? (
                <div className="flex min-w-0 items-center gap-2 pr-2">
                  <Activity className="size-4 shrink-0" strokeWidth={1.8} />
                  <span className="truncate text-sm font-semibold">
                    {t.appName}
                  </span>
                </div>
              ) : null}
            </div>
            {!collapsed ? (
              <div className="titlebar-drag h-full min-w-0 flex-1" />
            ) : null}
          </div>

          <nav
            className="mt-2 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2"
            style={{ width }}
          >
            {nav.map((item) => {
              const Icon = item.icon;
              const active =
                item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);
              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground",
                    active && "bg-secondary/60 text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon
                    className="size-4 shrink-0"
                    strokeWidth={1.8}
                    fillOpacity={active ? 0.14 : 0}
                    fill="currentColor"
                  />
                  {!collapsed ? <span>{item.label}</span> : null}
                </NavLink>
              );
              if (!collapsed) return link;
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2 px-2 pb-4" style={{ width }}>
            <div
              className={cn(
                "flex items-center gap-2 rounded-md bg-secondary/55 px-2.5 py-2",
                collapsed && "justify-center px-0",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  running ? "bg-success" : "bg-muted-foreground/50",
                )}
              />
              {!collapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    {core?.status ?? "unknown"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {core?.version
                      ? `mihomo ${core.version}`
                      : t.shell.coreIdle}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div
          className="flex h-screen flex-1 flex-col transition-[padding] duration-200 ease-out"
          style={{ paddingLeft: width }}
        >
          {/*
            Content top drag across the full width (including top-right).
            Left hole only when collapsed so the expand control stays clickable.
            Toast close buttons stay clickable via CSS no-drag on [data-sonner-*]
            and toaster offset below this strip — no permanent right dead zone.
          */}
          <div
            className="z-20 flex w-full shrink-0"
            style={{ height: TOP_SAFE }}
            aria-hidden
          >
            {collapsed ? (
              <div
                className="titlebar-no-drag h-full shrink-0"
                style={{ width: LIGHTS_PAD + 36 - width }}
              />
            ) : null}
            <div className="titlebar-drag h-full min-w-0 flex-1" />
          </div>
          {/*
            Height chain for list pages:
            content column (h-screen) → main (flex-1 basis-0 min-h-0) → ListPage → ListPanel
          */}
          <main className="mx-auto flex w-full min-h-0 max-w-[1280px] flex-1 basis-0 flex-col overflow-y-auto px-5 pb-6 pt-1 sm:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
