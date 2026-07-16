import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeJsonFile, readJsonFile } from "./paths";

describe("writeJsonFile atomic", () => {
  it("writes and reads JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clashnode-"));
    const file = path.join(dir, "t.json");
    writeJsonFile(file, { a: 1, b: "x" });
    const data = readJsonFile(file, { a: 0 });
    expect(data).toEqual({ a: 1, b: "x" });
    // no leftover tmp
    const leftovers = fs.readdirSync(dir).filter((n) => n.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});
