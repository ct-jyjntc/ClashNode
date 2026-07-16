import { describe, expect, it } from "vitest";
import {
  assertLooksLikeClashConfig,
  maybeDecodeSubscription,
  shareLinksToMinimalYaml,
} from "./profiles";

describe("maybeDecodeSubscription", () => {
  it("passes through YAML", () => {
    const yaml = "proxies:\n  - name: a\nrules:\n  - MATCH,DIRECT\n";
    expect(maybeDecodeSubscription(yaml)).toContain("proxies:");
  });

  it("wraps share links", () => {
    const raw = "ss://YWVzLTI1Ni1nY206cGFzc0BleGFtcGxlLmNvbTo4Mzg4#node";
    const out = maybeDecodeSubscription(raw);
    expect(out).toContain("proxies: []");
    expect(out).toContain("# Original subscription");
  });
});

describe("assertLooksLikeClashConfig", () => {
  it("accepts clash-like content", () => {
    expect(() =>
      assertLooksLikeClashConfig("proxies:\n  - name: a\n"),
    ).not.toThrow();
  });
  it("rejects unrelated content", () => {
    expect(() => assertLooksLikeClashConfig("hello world")).toThrow();
  });
});

describe("shareLinksToMinimalYaml", () => {
  it("returns minimal shell", () => {
    const y = shareLinksToMinimalYaml("ss://x");
    expect(y).toContain("MATCH,DIRECT");
  });
});
