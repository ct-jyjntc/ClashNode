import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/shared/lib/utils";

/**
 * Shared list panel for Proxies / Connections / Rules / Logs.
 *
 * Height strategy (must keep this chain intact):
 *   shell main: flex-1 min-h-0 flex flex-col
 *   ListPage:   flex-1 basis-0 min-h-0 flex flex-col
 *   ListPanel:  flex-1 basis-0 min-h-0
 *
 * `basis-0` is required so the flex item can grow from zero and fill
 * remaining space instead of sizing to content (which left a big gap).
 */
export const LIST_PANEL_CLASS = "min-h-0 flex-1 basis-0";

/** Table header / body row — same height across Connections / Rules / Proxies. */
export const TABLE_HEAD_CLASS =
  "flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs font-normal text-muted-foreground";
export const TABLE_ROW_CLASS =
  "flex h-9 w-full items-center gap-2 border-b border-border/40 px-3 text-left text-xs transition-colors hover:bg-secondary/40";

export function ListPanel({
  header,
  children,
  className,
  empty,
  isEmpty,
}: {
  header?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  empty?: React.ReactNode;
  isEmpty?: boolean;
}) {
  return (
    <Card
      className={cn(
        "flex min-h-0 flex-1 basis-0 flex-col overflow-hidden",
        className,
      )}
    >
      {header ? <div className="shrink-0">{header}</div> : null}
      <div className="relative min-h-0 flex-1">
        <ScrollArea className="absolute inset-0 h-full">
          {isEmpty ? (
            <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-muted-foreground">
              {empty}
            </div>
          ) : (
            children
          )}
        </ScrollArea>
      </div>
    </Card>
  );
}

/** Same flex footprint for offline / empty full-page placeholders. */
export function ListPanelPlaceholder({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex min-h-0 flex-1 basis-0 items-center justify-center p-6 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </Card>
  );
}

/** Page shell for list-style screens so ListPanel can flex-fill. */
export function ListPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Shared title→content rhythm (space-y-6 / gap-6)
        "flex min-h-0 flex-1 basis-0 flex-col gap-6 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
