import { describe, it, expect } from "vitest";
import { parseCustomMood } from "./MoodSelector";

describe("parseCustomMood", () => {
  it("sépare « emoji label » au premier espace", () => {
    expect(parseCustomMood("🥰 amoureux·se")).toEqual({
      emoji: "🥰",
      label: "amoureux·se",
    });
  });

  it("emoji seul (pas d'espace) => label vide", () => {
    expect(parseCustomMood("🔥")).toEqual({ emoji: "🔥", label: "" });
  });

  it("garde les espaces suivants dans le label", () => {
    expect(parseCustomMood("😎 trop cool")).toEqual({
      emoji: "😎",
      label: "trop cool",
    });
  });
});
