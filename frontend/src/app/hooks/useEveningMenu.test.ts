import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as api from "../../api/client";
import { useEveningMenu } from "./useEveningMenu";
import type { ApiEveningMenuItem, ApiEveningMenuStatus } from "../../api/types";

vi.mock("../../api/client");

const a = vi.mocked(api, true);

const item = (code: string, over: Partial<ApiEveningMenuItem> = {}): ApiEveningMenuItem => ({
  code,
  category: "tender",
  categoryLabelFr: "Tendre",
  categoryLabelEn: "Tender",
  subcategory: null,
  labelFr: code,
  labelEn: code,
  labelFrSoft: null,
  labelEnSoft: null,
  descriptionFr: null,
  descriptionEn: null,
  intensity: "soft",
  course: "starter",
  picked: false,
  matched: false,
  partnerWants: false,
  refused: false,
  ...over,
});

const status = (over: Partial<ApiEveningMenuStatus> = {}): ApiEveningMenuStatus => ({
  meDone: false,
  doneCount: 0,
  memberCount: 2,
  revealed: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  a.listEveningMenu.mockResolvedValue([item("a"), item("b")]);
  a.getEveningMenuStatus.mockResolvedValue(status());
});

async function setup(enabled = true) {
  const hook = renderHook(() => useEveningMenu("s1", enabled));
  if (enabled) await waitFor(() => expect(hook.result.current.items).toHaveLength(2));
  return hook;
}

describe("useEveningMenu", () => {
  it("charge le menu ET l'état de validation", async () => {
    const { result } = await setup();
    expect(result.current.status).toEqual(status());
  });

  it("désactivé : ne charge rien, vide l'état", async () => {
    const { result } = await setup(false);
    expect(a.listEveningMenu).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.status).toBeNull();
  });

  it("toggle : choix optimiste puis remplacé par la réponse serveur (service transmis)", async () => {
    a.pickEveningMenu.mockResolvedValue(item("a", { picked: true, matched: true, course: "dessert" }));
    const { result } = await setup();
    await act(async () => {
      await result.current.toggle("a", "dessert");
    });
    expect(a.pickEveningMenu).toHaveBeenCalledWith("s1", "a", "want", "dessert");
    expect(result.current.items.find((i) => i.code === "a")).toMatchObject({
      picked: true,
      matched: true,
    });
  });

  it("toggle sur un item déjà choisi → retrait", async () => {
    a.listEveningMenu.mockResolvedValue([item("a", { picked: true }), item("b")]);
    a.unpickEveningMenu.mockResolvedValue(item("a"));
    const { result } = await setup();
    await act(async () => {
      await result.current.toggle("a");
    });
    expect(a.unpickEveningMenu).toHaveBeenCalledWith("s1", "a");
    expect(result.current.items.find((i) => i.code === "a")?.picked).toBe(false);
  });

  it("toggle en échec : l'état précédent est restauré", async () => {
    a.pickEveningMenu.mockRejectedValue(new Error("409"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await setup();
    await act(async () => {
      await result.current.toggle("a");
    });
    expect(result.current.items.find((i) => i.code === "a")?.picked).toBe(false);
  });

  it("refuse : refus optimiste, envoyé comme stance « refused »", async () => {
    a.pickEveningMenu.mockResolvedValue(item("a", { refused: true }));
    const { result } = await setup();
    await act(async () => {
      await result.current.refuse("a");
    });
    expect(a.pickEveningMenu).toHaveBeenCalledWith("s1", "a", "refused");
    expect(result.current.items.find((i) => i.code === "a")?.refused).toBe(true);
  });

  it("refuse en échec : restauré", async () => {
    a.pickEveningMenu.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await setup();
    await act(async () => {
      await result.current.refuse("a");
    });
    expect(result.current.items.find((i) => i.code === "a")?.refused).toBe(false);
  });

  it("setDone(true) valide puis recharge (les choix dévoilés arrivent)", async () => {
    a.setEveningMenuDone.mockResolvedValue(status({ meDone: true, doneCount: 2, revealed: true }));
    a.getEveningMenuStatus.mockResolvedValue(status({ meDone: true, doneCount: 2, revealed: true }));
    a.listEveningMenu.mockResolvedValue([item("a"), item("b", { partnerWants: true })]);
    const { result } = await setup();
    await act(async () => {
      await result.current.setDone(true);
    });
    expect(a.setEveningMenuDone).toHaveBeenCalledWith("s1", true);
    expect(result.current.status?.revealed).toBe(true);
    expect(result.current.items.find((i) => i.code === "b")?.partnerWants).toBe(true);
  });

  it("setDone en échec : silencieux, l'état ne bouge pas", async () => {
    a.setEveningMenuDone.mockRejectedValue(new Error("409"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await setup();
    await act(async () => {
      await result.current.setDone(true);
    });
    expect(result.current.status).toEqual(status());
  });
});
