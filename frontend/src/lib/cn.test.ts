import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joint les classes et filtre false/null/undefined", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("rien ou que du falsy → chaîne vide", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });
});
