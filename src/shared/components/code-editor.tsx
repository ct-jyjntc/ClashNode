import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { cn } from "@/shared/lib/utils";

export type CodeEditorLanguage = "javascript" | "yaml" | "json" | "text";

type Props = {
  value: string;
  onChange?: (v: string) => void;
  language?: CodeEditorLanguage;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
};

export function CodeEditor({
  value,
  onChange,
  language = "text",
  readOnly = false,
  className,
  minHeight = "240px",
}: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const extensions = useMemo(() => {
    const list = [
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { fontSize: "12px" },
        ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
        ".cm-scroller": { overflow: "auto" },
      }),
    ];
    if (language === "javascript") list.push(javascript());
    if (language === "yaml" || language === "json") list.push(yaml());
    if (readOnly) list.push(EditorView.editable.of(false));
    return list;
  }, [language, readOnly]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-background",
        className,
      )}
      style={{ minHeight }}
    >
      <CodeMirror
        value={value}
        height={minHeight}
        theme={dark ? oneDark : "light"}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          bracketMatching: true,
        }}
        editable={!readOnly}
        onChange={(v) => onChange?.(v)}
      />
    </div>
  );
}
