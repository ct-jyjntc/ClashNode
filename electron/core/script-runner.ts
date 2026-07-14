import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Run a FlClash-style overwrite script:
 *   function main(config) { ...; return config }
 *
 * Uses a temporary ESM module so user scripts can be plain JS with a main().
 */
export async function runConfigScript(
  scriptContent: string,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(path.join(tmpdir(), "clashnode-script-"));
  const file = path.join(dir, "user-script.mjs");
  const wrapped = `${scriptContent}

export async function __clashnode_run(config) {
  if (typeof main !== "function") {
    throw new Error("Script must define function main(config)");
  }
  const result = await main(config);
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("main(config) must return a config object");
  }
  return result;
}
`;
  writeFileSync(file, wrapped, "utf8");
  try {
    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    const next = await mod.__clashnode_run(structuredClone(config));
    return next as Record<string, unknown>;
  } finally {
    try {
      unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}
