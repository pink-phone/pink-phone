import { describe, it, expect, beforeEach, vi } from "vitest";
import { isPinSet, setPin, verifyPin, clearPin } from "./pin";

// localStorage indispo sous Node 26+ : stub minimal en mémoire.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("lib/pin", () => {
  it("aucun code au départ", () => {
    expect(isPinSet()).toBe(false);
  });

  it("setPin → isPinSet, vérifie le bon code et rejette les autres", async () => {
    await setPin("1234");
    expect(isPinSet()).toBe(true);
    expect(await verifyPin("1234")).toBe(true);
    expect(await verifyPin("0000")).toBe(false);
  });

  it("ne stocke jamais le code en clair (hash salé)", async () => {
    await setPin("4321");
    const raw = localStorage.getItem("pp_pin")!;
    expect(raw).not.toContain("4321");
    const { salt, hash } = JSON.parse(raw);
    expect(salt).toBeTruthy();
    expect(hash).toBeTruthy();
  });

  it("clearPin désactive le verrouillage", async () => {
    await setPin("1234");
    clearPin();
    expect(isPinSet()).toBe(false);
    expect(await verifyPin("1234")).toBe(false);
  });

  it("sel aléatoire : deux configs du même code → hashs différents", async () => {
    await setPin("1234");
    const a = localStorage.getItem("pp_pin")!;
    await setPin("1234");
    const b = localStorage.getItem("pp_pin")!;
    expect(a).not.toEqual(b);
  });
});
