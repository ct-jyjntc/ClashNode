import { Card } from "@/components/ui/card";
import { cn } from "@/shared/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  className,
  action,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={cn("min-h-28 p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3 text-xl font-medium tabular-nums tracking-tight">
        {value}
      </div>
      {hint ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );
}
