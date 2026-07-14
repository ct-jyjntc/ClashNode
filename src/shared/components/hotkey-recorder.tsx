import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";

function isModKey(key: string) {
  return (
    key === "Meta" ||
    key === "Control" ||
    key === "Alt" ||
    key === "Shift" ||
    key === "OS"
  );
}

/** Map a KeyboardEvent to an Electron accelerator string. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (isModKey(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  else if (key.startsWith("Arrow")) key = key.replace("Arrow", "");
  else if (key === "Escape") key = "Esc";

  // Reject bare modifiers-only / empty
  if (!key || isModKey(key)) return null;
  parts.push(key);
  return parts.join("+");
}

export function HotkeyRecorder({
  value,
  onChange,
  clearLabel = "Clear",
  recordingLabel = "Press keys…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  clearLabel?: string;
  recordingLabel?: string;
  className?: string;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const acc = eventToAccelerator(e);
      if (!acc) return;
      onChange(acc);
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onChange]);

  return (
    <div className={cn("flex gap-2", className)}>
      <Input
        readOnly
        value={recording ? recordingLabel : value || ""}
        placeholder="—"
        className={cn(
          "font-mono text-xs",
          recording && "ring-1 ring-ring",
        )}
        onFocus={() => setRecording(true)}
        onClick={() => setRecording(true)}
        onBlur={() => {
          // slight delay so click-clear still works
          window.setTimeout(() => setRecording(false), 120);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0 text-muted-foreground"
        onClick={() => {
          setRecording(false);
          onChange("");
        }}
      >
        {clearLabel}
      </Button>
    </div>
  );
}
