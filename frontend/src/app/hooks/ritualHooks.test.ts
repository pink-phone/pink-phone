import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api/client";
import type { ApiDesire, ApiEveningMenuItem, ApiLoveNote } from "../../api/types";
import { useDesires } from "./useDesires";
import { useEveningMenu } from "./useEveningMenu";
import { useLoveNotes } from "./useLoveNotes";

vi.mock("../../api/client");
const a = vi.mocked(api, true);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const menuItem = (code: string, over: Partial<ApiEveningMenuItem> = {}) =>
  ({ code, picked: false, matched: false, refused: false, course: "main", ...over }) as ApiEveningMenuItem;
const desire = (code: string, over: Partial<ApiDesire> = {}) =>
  ({ code, interested: false, against: false, matched: false, limit: false, done: false, ...over }) as ApiDesire;

describe("useEveningMenu", () => {
  it("désactivé : liste vide et aucun appel réseau", async () => {
    const { result } = renderHook(() => useEveningMenu("s1", false));
    await act(async () => {});
    expect(result.current.items).toEqual([]);
    expect(result.current.status).toBeNull();
    expect(a.listEveningMenu).not.toHaveBeenCalled();
  });

  it("activé : charge le menu et le statut au montage", async () => {
    a.listEveningMenu.mockResolvedValue([menuItem("m1")]);
    a.getEveningMenuStatus.mockResolvedValue({ done: false } as never);
    const { result } = renderHook(() => useEveningMenu("s1", true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.status).toEqual({ done: false });
  });

  it("échec de chargement : ignoré (best-effort)", async () => {
    a.listEveningMenu.mockRejectedValue(new Error("403"));
    a.getEveningMenuStatus.mockRejectedValue(new Error("403"));
    const { result } = renderHook(() => useEveningMenu("s1", true));
    await act(async () => {});
    expect(result.current.items).toEqual([]);
  });

  async function loaded(items: ApiEveningMenuItem[]) {
    a.listEveningMenu.mockResolvedValue(items);
    a.getEveningMenuStatus.mockResolvedValue(null as never);
    const hook = renderHook(() => useEveningMenu("s1", true));
    await waitFor(() => expect(hook.result.current.items).toHaveLength(items.length));
    return hook;
  }

  it("toggle : pioche (optimiste puis état serveur) dans le service demandé", async () => {
    const { result } = await loaded([menuItem("m1")]);
    a.pickEveningMenu.mockResolvedValue(menuItem("m1", { picked: true, matched: true, course: "dessert" }));
    await act(() => result.current.toggle("m1", "dessert"));
    expect(a.pickEveningMenu).toHaveBeenCalledWith("s1", "m1", "want", "dessert");
    expect(result.current.items[0]).toMatchObject({ picked: true, matched: true, course: "dessert" });
  });

  it("toggle sur un item déjà choisi : le retire", async () => {
    const { result } = await loaded([menuItem("m1", { picked: true, matched: true })]);
    a.unpickEveningMenu.mockResolvedValue(menuItem("m1"));
    await act(() => result.current.toggle("m1"));
    expect(a.unpickEveningMenu).toHaveBeenCalledWith("s1", "m1");
    expect(result.current.items[0]).toMatchObject({ picked: false, matched: false });
  });

  it("toggle en échec : l'état optimiste est annulé", async () => {
    const { result } = await loaded([menuItem("m1")]);
    a.pickEveningMenu.mockRejectedValue(new Error("boom"));
    await act(() => result.current.toggle("m1"));
    expect(result.current.items[0].picked).toBe(false);
  });

  it("refuse : marque refusé (serveur), annulé si l'API échoue", async () => {
    const { result } = await loaded([menuItem("m1", { picked: true })]);
    a.pickEveningMenu.mockResolvedValueOnce(menuItem("m1", { refused: true }));
    await act(() => result.current.refuse("m1"));
    expect(a.pickEveningMenu).toHaveBeenCalledWith("s1", "m1", "refused");
    expect(result.current.items[0].refused).toBe(true);

    a.pickEveningMenu.mockRejectedValueOnce(new Error("400"));
    await act(() => result.current.refuse("m1"));
    expect(result.current.items[0].refused).toBe(true); // retour à l'état précédent (refusé)
  });

  it("setDone : met à jour le statut puis recharge le menu", async () => {
    const { result } = await loaded([menuItem("m1")]);
    a.setEveningMenuDone.mockResolvedValue({ done: true } as never);
    a.getEveningMenuStatus.mockResolvedValue({ done: true } as never);
    await act(() => result.current.setDone(true));
    expect(a.setEveningMenuDone).toHaveBeenCalledWith("s1", true);
    expect(result.current.status).toEqual({ done: true });

    a.setEveningMenuDone.mockRejectedValue(new Error("x"));
    await act(() => result.current.setDone(false)); // erreur avalée
  });
});

describe("useDesires", () => {
  it("désactivé : liste vide, aucun appel", async () => {
    const { result } = renderHook(() => useDesires("s1", false));
    await act(async () => {});
    expect(result.current.desires).toEqual([]);
    expect(a.listDesires).not.toHaveBeenCalled();
  });

  async function loaded(items: ApiDesire[]) {
    a.listDesires.mockResolvedValue(items);
    const hook = renderHook(() => useDesires("s1", true));
    await waitFor(() => expect(hook.result.current.desires).toHaveLength(items.length));
    return hook;
  }

  it("setStance « want » : optimiste puis état serveur ; re-clic = retrait", async () => {
    const { result } = await loaded([desire("d1")]);
    a.setDesireStance.mockResolvedValue(desire("d1", { interested: true, matched: true }));
    await act(() => result.current.setStance("d1", "want"));
    expect(a.setDesireStance).toHaveBeenCalledWith("s1", "d1", "want");
    expect(result.current.desires[0]).toMatchObject({ interested: true, matched: true });

    a.clearDesireStance.mockResolvedValue(desire("d1"));
    await act(() => result.current.setStance("d1", "want"));
    expect(a.clearDesireStance).toHaveBeenCalledWith("s1", "d1");
    expect(result.current.desires[0]).toMatchObject({ interested: false, matched: false });
  });

  it("setStance « against » : pose une limite", async () => {
    const { result } = await loaded([desire("d1", { matched: true })]);
    a.setDesireStance.mockResolvedValue(desire("d1", { against: true, limit: true }));
    await act(() => result.current.setStance("d1", "against"));
    expect(result.current.desires[0]).toMatchObject({ against: true, limit: true, matched: false });
  });

  it("setStance en échec : resynchronise depuis l'API", async () => {
    const { result } = await loaded([desire("d1")]);
    a.setDesireStance.mockRejectedValue(new Error("boom"));
    a.listDesires.mockClear();
    await act(() => result.current.setStance("d1", "want"));
    expect(a.listDesires).toHaveBeenCalledWith("s1");
  });

  it("toggleDone : bascule « réalisé » ; annulé si l'API échoue", async () => {
    const { result } = await loaded([desire("d1")]);
    a.setDesireDone.mockResolvedValue(desire("d1", { done: true }));
    await act(() => result.current.toggleDone("d1"));
    expect(result.current.desires[0].done).toBe(true);

    a.unsetDesireDone.mockRejectedValue(new Error("x"));
    await act(() => result.current.toggleDone("d1"));
    expect(result.current.desires[0].done).toBe(true); // retour à l'état précédent
  });

  it("chargement en échec : ignoré", async () => {
    a.listDesires.mockRejectedValue(new Error("403"));
    const { result } = renderHook(() => useDesires("s1", true));
    await act(async () => {});
    expect(result.current.desires).toEqual([]);
  });
});

describe("useLoveNotes", () => {
  const note = (id: string) => ({ id, body: "x" }) as ApiLoveNote;

  it("refetch charge ; en échec, ignore", async () => {
    a.listLoveNotes.mockResolvedValueOnce([note("n1")]);
    const { result } = renderHook(() => useLoveNotes("s1"));
    await act(() => result.current.refetch());
    expect(result.current.notes).toHaveLength(1);
    a.listLoveNotes.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.refetch());
    expect(result.current.notes).toHaveLength(1);
  });

  it("add : préfixe la liste (true) ; en échec renvoie false", async () => {
    const { result } = renderHook(() => useLoveNotes("s1"));
    a.createLoveNote.mockResolvedValueOnce(note("n1"));
    let ok = false;
    await act(async () => {
      ok = await result.current.add("coucou", "2030-01-01T00:00:00Z");
    });
    expect(ok).toBe(true);
    expect(a.createLoveNote).toHaveBeenCalledWith("s1", { body: "coucou", openAt: "2030-01-01T00:00:00Z" });
    a.createLoveNote.mockResolvedValueOnce(note("n2"));
    await act(async () => {
      await result.current.add("deux");
    });
    expect(result.current.notes.map((n) => n.id)).toEqual(["n2", "n1"]);

    a.createLoveNote.mockRejectedValueOnce(new Error("x"));
    await act(async () => {
      ok = await result.current.add("raté");
    });
    expect(ok).toBe(false);
  });

  it("remove : retire le mot ; en échec, le garde", async () => {
    const { result } = renderHook(() => useLoveNotes("s1"));
    a.createLoveNote.mockResolvedValue(note("n1"));
    await act(async () => {
      await result.current.add("x");
    });
    a.deleteLoveNote.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.remove("n1"));
    expect(result.current.notes).toHaveLength(1);
    a.deleteLoveNote.mockResolvedValueOnce(undefined as never);
    await act(() => result.current.remove("n1"));
    expect(result.current.notes).toHaveLength(0);
  });
});
