/**
 * Apply optional accent + text scale from app settings onto :root.
 * Visual 1.00 is the former 1.05 size (base 14.7px).
 */
const BASE_FONT_PX = 14 * 1.05;

export function applyUiChrome(opts: {
  accentColor?: string;
  textScale?: number;
}) {
  const root = document.documentElement;
  const accent = (opts.accentColor || "").trim();
  if (accent && /^#([0-9a-fA-F]{6})$/.test(accent)) {
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--ring", accent);
    root.style.setProperty("--sidebar-primary", accent);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--sidebar-primary");
  }

  const scale = opts.textScale ?? 1;
  const clamped = Math.min(1.25, Math.max(0.85, scale));
  root.style.fontSize = `${BASE_FONT_PX * clamped}px`;
}
