import { describe, it, expect, vi, afterEach } from "vitest";
import { confirmAction } from "./confirm";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("confirmAction", () => {
  it("relaie la réponse de window.confirm et passe le message", () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(confirmAction("Supprimer ?")).toBe(true);
    expect(spy).toHaveBeenCalledWith("Supprimer ?");

    spy.mockReturnValue(false);
    expect(confirmAction("Supprimer ?")).toBe(false);
  });
});
