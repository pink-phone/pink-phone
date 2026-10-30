import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const report = vi.fn();
vi.mock("./api/client", () => ({ reportClientLogs: (e: unknown) => report(e) }));

async function load() {
  vi.resetModules();
  return import("./clientLog");
}

beforeEach(() => {
  report.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("clientLog", () => {
  it("logClientError met en file puis vide après le délai", async () => {
    const { logClientError } = await load();
    logClientError("boom", "ctx");
    logClientError("deux");
    expect(report).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith([
      { level: "error", message: "boom", context: "ctx" },
      { level: "error", message: "deux", context: undefined },
    ]);
  });

  it("plafonne la file à 50 entrées (les plus anciennes sont écartées)", async () => {
    const { logClientError } = await load();
    for (let i = 0; i < 55; i++) logClientError(`m${i}`);
    vi.advanceTimersByTime(3000);
    const batch = report.mock.calls[0][0] as { message: string }[];
    expect(batch).toHaveLength(50);
    expect(batch[0].message).toBe("m5");
    expect(batch[49].message).toBe("m54");
  });

  it("capte window 'error' avec fichier:ligne:col", async () => {
    const { initClientLogging } = await load();
    initClientLogging();
    window.dispatchEvent(
      new ErrorEvent("error", { message: "kaput", filename: "a.js", lineno: 3, colno: 7 }),
    );
    window.dispatchEvent(new ErrorEvent("error", { message: "" }));
    window.dispatchEvent(new Event("pagehide"));
    const batch = report.mock.calls[report.mock.calls.length - 1][0] as { message: string; context?: string }[];
    expect(batch[0]).toMatchObject({ message: "kaput", context: "a.js:3:7" });
    expect(batch[1]).toMatchObject({ message: "erreur inconnue", context: undefined });
  });

  it("capte unhandledrejection (string, Error, vide)", async () => {
    const { initClientLogging } = await load();
    initClientLogging();
    const rej = (reason: unknown) => {
      const e = new Event("unhandledrejection") as Event & { reason: unknown };
      e.reason = reason;
      window.dispatchEvent(e);
    };
    rej("texte");
    rej(new Error("objet"));
    rej(undefined);
    window.dispatchEvent(new Event("pagehide"));
    const batch = report.mock.calls[report.mock.calls.length - 1][0] as { message: string; context?: string }[];
    expect(batch.map((b) => b.message)).toEqual([
      "texte",
      "objet",
      "rejet de promesse non géré",
    ]);
    expect(batch.every((b) => b.context === "unhandledrejection")).toBe(true);
  });

  it("vide la file quand l'onglet passe en arrière-plan", async () => {
    const { initClientLogging, logClientError } = await load();
    initClientLogging();
    logClientError("avant départ");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(report).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("ne rappelle pas reportClientLogs si la file est vide", async () => {
    const { initClientLogging } = await load();
    initClientLogging();
    window.dispatchEvent(new Event("pagehide"));
    expect(report).not.toHaveBeenCalled();
  });
});
