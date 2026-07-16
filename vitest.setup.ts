import { vi } from "vitest";
import os from "node:os";
import path from "node:path";

const userData = path.join(os.tmpdir(), "clashnode-vitest-userdata");

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") return userData;
      return userData;
    },
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getVersion: () => "0.0.0-test",
  },
}));
