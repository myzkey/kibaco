import { describe, expect, it } from "vitest";
import { kibanConfigSchema } from "./types.js";
import { normalizeConfig } from "./config.js";

describe("kiban config", () => {
  it("parses a minimal config", () => {
    const config = kibanConfigSchema.parse({ workspace: "demo" });
    expect(config.projects).toEqual([]);
    expect(config.services).toEqual([]);
  });

  it("expands project home paths", () => {
    const config = normalizeConfig(
      kibanConfigSchema.parse({
        workspace: "demo",
        projects: [{ name: "web", path: "~/web", command: "pnpm dev" }]
      })
    );
    expect(config.projects[0]?.path).not.toBe("~/web");
  });
});
