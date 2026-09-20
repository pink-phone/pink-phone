import { describe, it, expect } from "vitest";
import { buildsDiffer, formatBuild, shortCommit, WEB_BUILD } from "./buildInfo";

const SHA = "432f3f5abcdef0123456789abcdef0123456789a";

describe("buildInfo", () => {
  it("WEB_BUILD vaut « dev » hors pipeline (tests, Storybook)", () => {
    expect(WEB_BUILD.version).toBe("dev");
    expect(WEB_BUILD.commit).toBe("");
  });

  it("shortCommit garde 7 caractères", () => {
    expect(shortCommit(SHA)).toBe("432f3f5");
    expect(shortCommit("abc")).toBe("abc");
    expect(shortCommit("")).toBe("");
  });

  it("formatBuild : version + SHA court, ou version seule sans commit", () => {
    expect(formatBuild({ version: "0.0.147", commit: SHA })).toBe(
      "0.0.147 · 432f3f5",
    );
    expect(formatBuild({ version: "gh-1.4.0", commit: SHA })).toBe(
      "gh-1.4.0 · 432f3f5",
    );
    expect(formatBuild({ version: "dev", commit: "" })).toBe("dev");
  });

  describe("buildsDiffer", () => {
    const a = { version: "0.0.147", commit: SHA };

    it("identiques → false", () => {
      expect(buildsDiffer(a, { ...a })).toBe(false);
    });

    it("versions différentes → true", () => {
      expect(buildsDiffer(a, { version: "0.0.148", commit: SHA })).toBe(true);
    });

    it("même version mais commits différents → true", () => {
      expect(buildsDiffer(a, { version: "0.0.147", commit: "ffff" + SHA })).toBe(
        true,
      );
    });

    it("commit inconnu d'un côté → ne signale pas", () => {
      expect(buildsDiffer(a, { version: "0.0.147", commit: "" })).toBe(false);
    });

    it("build « dev » : jamais de signalement", () => {
      expect(buildsDiffer({ version: "dev", commit: "" }, a)).toBe(false);
      expect(buildsDiffer(a, { version: "dev", commit: "" })).toBe(false);
    });
  });
});
