import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api/client", () => ({ reportClientLogs: vi.fn() }));

// Le module garde une file + un minuteur en état de module : on le recharge à
// chaque test, et on enregistre les écouteurs globaux une seule fois par rechargement.
async function load() {
  vi.resetModules();
  const client = await import("./api/client");
  const mod = await import("./clientLog");
  return { report: vi.mocked(client.reportClientLogs), ...mod };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("clientLog", () => {
  it("logClientError : envoi différé groupé (une seule requête)", async () => {
    const { report, logClientError } = await load();
    logClientError("a", "ctx");
    logClientError("b");
    expect(report).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toEqual([
      { level: "error", message: "a", context: "ctx" },
      { level: "error", message: "b", context: undefined },
    ]);
    vi.advanceTimersByTime(10_000);
    expect(report).toHaveBeenCalledTimes(1); // file vidée, plus d'envoi
  });

  it("la file est bornée (les plus anciennes sont abandonnées)", async () => {
    const { report, logClientError } = await load();
    for (let i = 0; i < 60; i++) logClientError(`m${i}`);
    vi.advanceTimersByTime(3000);
    const batch = report.mock.calls[0][0];
    expect(batch).toHaveLength(50);
    expect(batch[0].message).toBe("m10");
    expect(batch[49].message).toBe("m59");
  });

  it("initClientLogging : capte window.error et unhandledrejection", async () => {
    const { report, initClientLogging } = await load();
    initClientLogging();
    window.dispatchEvent(
      new ErrorEvent("error", { message: "boom", filename: "app.js", lineno: 3, colno: 7 }),
    );
    window.dispatchEvent(new ErrorEvent("error", { message: "" }));
    const rej = (reason: unknown) => {
      const e = new Event("unhandledrejection") as Event & { reason: unknown };
      e.reason = reason;
      window.dispatchEvent(e);
    };
    rej("texte");
    rej({ message: "objet" });
    rej(undefined);
    vi.advanceTimersByTime(3000);
    expect(report.mock.calls[0][0]).toEqual([
      { level: "error", message: "boom", context: "app.js:3:7" },
      { level: "error", message: "erreur inconnue", context: undefined },
      { level: "error", message: "texte", context: "unhandledrejection" },
      { level: "error", message: "objet", context: "unhandledrejection" },
      { level: "error", message: "rejet de promesse non géré", context: "unhandledrejection" },
    ]);
  });

  it("vide la file immédiatement au pagehide et quand l'onglet passe en arrière-plan", async () => {
    const { report, initClientLogging, logClientError } = await load();
    initClientLogging();
    logClientError("x");
    window.dispatchEvent(new Event("pagehide"));
    expect(report).toHaveBeenCalledTimes(1);

    logClientError("y");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(report).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(report).toHaveBeenCalledTimes(2); // visible : pas de flush
    window.dispatchEvent(new Event("pagehide")); // file vide : rien
    expect(report).toHaveBeenCalledTimes(2);
  });
});
