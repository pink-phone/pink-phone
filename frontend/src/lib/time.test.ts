import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { relativeTime } from "./time";

// La langue est forcée à "fr" dans le setup global.
describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("date invalide => chaîne vide", () => {
    expect(relativeTime("pas une date")).toBe("");
  });

  it("< 45 s => « maintenant »", () => {
    expect(relativeTime("2026-06-20T11:59:30.000Z")).toMatch(/maintenant/i);
  });

  it("quelques minutes dans le passé => « il y a N min »", () => {
    expect(relativeTime("2026-06-20T11:50:00.000Z")).toMatch(/min/);
  });

  it("quelques heures => libellé en heures", () => {
    const out = relativeTime("2026-06-20T09:00:00.000Z");
    expect(out).toMatch(/h|heure/);
  });

  it("au-delà d'une semaine => date courte (jour + mois)", () => {
    // ~40 jours avant : bascule sur toLocaleDateString.
    const out = relativeTime("2026-05-10T12:00:00.000Z");
    expect(out).toMatch(/mai|10/);
  });
});
