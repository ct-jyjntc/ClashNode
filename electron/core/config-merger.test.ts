import { describe, expect, it } from "vitest";
import { mergeConfig, sanitizeProxyGraph } from "./config-merger";
import { DEFAULT_SETTINGS } from "../shared/types";

describe("sanitizeProxyGraph", () => {
  it("stubs missing group members", () => {
    const base: Record<string, unknown> = {
      proxies: [],
      "proxy-groups": [
        { name: "PROXY", type: "select", proxies: ["node-a", "DIRECT"] },
      ],
      rules: ["MATCH,PROXY"],
    };
    const warnings = sanitizeProxyGraph(base);
    expect(warnings.some((w) => w.includes("node-a"))).toBe(true);
    const groups = base["proxy-groups"] as Array<{ name: string }>;
    expect(groups.some((g) => g.name === "node-a")).toBe(true);
  });
});

describe("mergeConfig", () => {
  it("injects advanced settings fields", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hosts: { "example.com": "1.2.3.4" },
      keepAliveInterval: 45,
      geodataLoader: "standard" as const,
      globalUa: "ClashNode/test",
      unifiedDelay: false,
      tcpConcurrent: false,
      findProcessMode: "off" as const,
      geoxUrl: {
        geoip: "https://example.com/geoip.dat",
        geosite: "https://example.com/geosite.dat",
        mmdb: "https://example.com/country.mmdb",
        asn: "https://example.com/asn.mmdb",
      },
      globalPrependRules: ["DOMAIN-SUFFIX,ads.example,REJECT"],
    };
    const { yaml } = await mergeConfig(null, settings, "secret");
    expect(yaml).toContain("keep-alive-interval: 45");
    expect(yaml).toContain("geodata-loader: standard");
    expect(yaml).toContain("global-ua: ClashNode/test");
    expect(yaml).toContain("unified-delay: false");
    expect(yaml).toContain("example.com: 1.2.3.4");
    expect(yaml).toContain("DOMAIN-SUFFIX,ads.example,REJECT");
    expect(yaml).toContain("geox-url:");
  });

  it("merges custom proxies, providers, groups, append rules", async () => {
    const profile = `
proxies:
  - name: a
    type: http
    server: 1.1.1.1
    port: 80
proxy-groups:
  - name: PROXY
    type: select
    proxies: [a, DIRECT]
rules:
  - DOMAIN,foo.com,PROXY
  - MATCH,DIRECT
`;
    const { yaml } = await mergeConfig(profile, DEFAULT_SETTINGS, "s", {
      customProxies: [
        { name: "b", type: "http", server: "2.2.2.2", port: 8080 },
      ],
      customProxyProviders: {
        myprov: { type: "http", url: "https://example.com/p", path: "./p.yaml" },
      },
      customProxyGroups: [
        {
          name: "AUTO",
          type: "url-test",
          proxies: ["a", "b"],
          url: "http://www.gstatic.com/generate_204",
          interval: 120,
          icon: "https://example.com/icon.png",
        },
      ],
      prependRules: ["DOMAIN-SUFFIX,pre.com,PROXY"],
      appendRules: ["DOMAIN-SUFFIX,post.com,PROXY"],
      globalPrependRules: ["DOMAIN-SUFFIX,global.com,REJECT"],
    });
    expect(yaml).toContain("name: b");
    expect(yaml).toContain("myprov:");
    expect(yaml).toContain("name: AUTO");
    expect(yaml).toContain("icon: https://example.com/icon.png");
    expect(yaml).toContain("DOMAIN-SUFFIX,global.com,REJECT");
    expect(yaml).toContain("DOMAIN-SUFFIX,pre.com,PROXY");
    expect(yaml).toContain("DOMAIN-SUFFIX,post.com,PROXY");
    // append before MATCH
    const postIdx = yaml.indexOf("DOMAIN-SUFFIX,post.com,PROXY");
    const matchIdx = yaml.indexOf("MATCH,DIRECT");
    expect(postIdx).toBeGreaterThan(-1);
    expect(matchIdx).toBeGreaterThan(postIdx);
  });
});
