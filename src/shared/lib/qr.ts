import jsQR from "jsqr";

/** Decode first QR from an image File (browser/Electron renderer). */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return code?.data?.trim() || null;
}

export function extractSubscriptionUrl(text: string): string | null {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) return t;
  try {
    const u = new URL(t);
    const nested =
      u.searchParams.get("url") ||
      u.searchParams.get("config") ||
      u.searchParams.get("sub");
    if (nested && /^https?:\/\//i.test(nested)) return nested;
  } catch {
    /* ignore */
  }
  const m = t.match(/https?:\/\/[^\s"'<>]+/i);
  return m?.[0] ?? null;
}
