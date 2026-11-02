import { beforeEach, describe, expect, it } from "vitest";
import { THEMES, applyTheme, getTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("expose les 8 thèmes", () => {
    expect(THEMES).toEqual(["felted", "red-velvet", "kawaii", "pixel", "cancan", "cuir", "synthwave"]);
  });

  it("retombe sur felted par défaut ou si la valeur stockée est inconnue", () => {
    expect(getTheme()).toBe("felted");
    localStorage.setItem("pp_theme", "nope");
    expect(getTheme()).toBe("felted");
  });

  it.each(THEMES)("applique et persiste %s", (th) => {
    applyTheme(th);
    expect(document.documentElement.dataset.theme).toBe(th);
    expect(getTheme()).toBe(th);
  });
});
