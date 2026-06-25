import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBackClose } from "./useBackClose";

beforeEach(() => {
  // Repart d'un historique propre pour chaque test.
  window.history.replaceState(null, "", "/");
});

describe("useBackClose", () => {
  it("fermé : n'empile aucune entrée d'historique", () => {
    const spy = vi.spyOn(window.history, "pushState");
    renderHook(() => useBackClose(false, vi.fn()));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ouvert : empile une entrée overlay", () => {
    const spy = vi.spyOn(window.history, "pushState");
    renderHook(() => useBackClose(true, vi.fn()));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.history.state).toMatchObject({ ppOverlay: true });
    spy.mockRestore();
  });

  it("un retour (popstate) appelle close", () => {
    const close = vi.fn();
    renderHook(() => useBackClose(true, close));
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fermeture programmatique (unmount) dépile l'entrée (history.back)", () => {
    const back = vi.spyOn(window.history, "back");
    const { unmount } = renderHook(() => useBackClose(true, vi.fn()));
    unmount();
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
});
