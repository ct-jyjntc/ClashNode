import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Boxes,
  Code2,
  Database,
  FileText,
  Globe2,
  LayoutDashboard,
  ListTree,
  Network,
  PanelLeft,
  PanelLeftClose,
  Radio,
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
import { useI18n } from "@/shared/i18n";

const STORAGE_KEY = "clashnode.sidebarCollapsed";

/** Top inset for traffic lights / caption bar + window drag (no visible bar). */
const TOP_SAFE = 40;
/** macOS traffic lights occupy ~0–70px; Windows has no left chrome — flush left. */
const LIGHTS_PAD_MAC = 78;
const LIGHTS_PAD_WIN = 12;

function detectIsMac() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const plat =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).userAgentData?.platform ||
    navigator.platform ||
    "";
  return /mac/i.test(plat) || /Mac OS X|Macintosh/i.test(ua);
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isMac] = useState(detectIsMac);
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // macOS: reserve space for traffic lights; Windows/Linux: sit near the left edge
  const lightsPad = isMac ? LIGHTS_PAD_MAC : LIGHTS_PAD_WIN;
  const width = collapsed ? 68 : 200;
  // Toggle (~28) + gap + "ClashNode" title — always shown (even when rail is collapsed)
  const titleClusterW = 28 + 6 + 88; // icon button + gap + label
  const headerClusterW = lightsPad + titleClusterW;

  const nav = [
    { to: "/", label: t.nav.dashboard, icon: LayoutDashboard },
    { to: "/proxies", label: t.nav.proxies, icon: Waypoints },
    { to: "/profiles", label: t.nav.profiles, icon: Globe2 },
    { to: "/providers", label: t.nav.providers, icon: Boxes },
    { to: "/requests", label: t.nav.requests, icon: Radio },
    { to: "/connections", label: t.nav.connections, icon: Network },
    { to: "/rules", label: t.nav.rules, icon: ListTree },
    { to: "/resources", label: t.nav.resources, icon: Database },
    { to: "/scripts", label: t.nav.scripts, icon: Code2 },
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
            Title always stays visible — when collapsed the cluster may extend
            past the 68px rail (aside overflow: visible).
            Never put drag on a parent that wraps the toggle button.
          */}
          <div
            className="flex shrink-0"
            style={{ height: TOP_SAFE }}
          >
            <div
              className="titlebar-no-drag flex h-full shrink-0 items-center gap-1.5"
              style={{
                // macOS: pad past traffic lights; Windows: small inset from edge
                paddingLeft: lightsPad,
                minWidth: headerClusterW,
              }}
            >
              {toggleBtn}
              <div className="flex min-w-0 items-center pr-2">
                <span className="truncate text-sm font-semibold tracking-tight">
                  {t.appName}
                </span>
              </div>
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

        </aside>

        <div
          className="flex h-screen flex-1 flex-col transition-[padding] duration-200 ease-out"
          style={{ paddingLeft: width }}
        >
          {/*
            Content top drag across the full width (including top-right).
            When collapsed, punch a no-drag hole for the overflow title cluster
            (toggle + ClashNode) so it stays clickable / not under drag.
            Toast close buttons stay clickable via CSS no-drag on [data-sonner-*]
            and toaster offset below this strip — no permanent right dead zone.
          */}
          <div
            className="z-20 flex w-full shrink-0"
            style={{ height: TOP_SAFE }}
            aria-hidden
          >
            {collapsed && headerClusterW > width ? (
              <div
                className="titlebar-no-drag h-full shrink-0"
                style={{ width: headerClusterW - width }}
              />
            ) : null}
            <div className="titlebar-drag h-full min-w-0 flex-1" />
          </div>
          {/*
            Height chain for list pages:
            content column (h-screen) → main (flex-1 basis-0 min-h-0) → ListPage → ListPanel
          */}
          {/*
            Asymmetric horizontal padding: left is tighter so the gap after the
            sidebar matches the right window edge more closely.
          */}
          <main className="mx-auto flex w-full min-h-0 min-w-0 max-w-[1280px] flex-1 basis-0 flex-col overflow-x-hidden overflow-y-auto pb-6 pl-3 pr-5 pt-1 sm:pl-4 sm:pr-8">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
