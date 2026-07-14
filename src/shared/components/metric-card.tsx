import { Card } from "@/components/ui/card";
import { cn } from "@/shared/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("min-h-28 p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-3 text-xl font-medium tabular-nums tracking-tight">
        {value}
      </div>
      {hint ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );
}
