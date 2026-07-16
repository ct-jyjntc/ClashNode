import { describe, expect, it } from "vitest";
import { migrateSettingsRaw } from "./settings";
import { SETTINGS_VERSION } from "../shared/types";

describe("migrateSettingsRaw", () => {
  it("upgrades missing version to current", () => {
    const next = migrateSettingsRaw({ mixedPort: 7890 });
    expect(next.settingsVersion).toBe(SETTINGS_VERSION);
  });
});
