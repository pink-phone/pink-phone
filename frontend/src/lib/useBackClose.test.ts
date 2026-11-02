import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBackClose } from "./useBackClose";

beforeEach(async () => {
  // Laisse retomber les popstate asynchrones des `history.back()` du test
  // précédent, puis repart d'un historique propre.
  await new Promise((r) => setTimeout(r, 30));
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

describe("useBackClose — surfaces imbriquées (sélecteur au-dessus d'un écran)", () => {
  const settle = () => new Promise((r) => setTimeout(r, 50));

  it("fermer la surface du dessus par code ne ferme PAS la surface parente", async () => {
    const outer = vi.fn();
    const { rerender } = renderHook(
      ({ inner }) => {
        useBackClose(true, outer);
        useBackClose(inner, vi.fn());
      },
      { initialProps: { inner: false } },
    );
    rerender({ inner: true }); // ouvre le sélecteur
    rerender({ inner: false }); // Valider / Annuler (programmatique)
    await settle();
    expect(outer).not.toHaveBeenCalled();
  });

  it("un retour réel ne ferme que la surface du dessus", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    renderHook(() => {
      useBackClose(true, outer);
      useBackClose(true, inner);
    });
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("après la fermeture du sélecteur, un retour réel ferme bien la surface parente", async () => {
    const outer = vi.fn();
    const { rerender } = renderHook(
      ({ inner }) => {
        useBackClose(true, outer);
        useBackClose(inner, vi.fn());
      },
      { initialProps: { inner: false } },
    );
    rerender({ inner: true });
    rerender({ inner: false });
    await settle();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
