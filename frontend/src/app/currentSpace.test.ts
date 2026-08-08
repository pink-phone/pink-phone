import { describe, it, expect } from "vitest";
import { pickCurrentSpace } from "./currentSpace";
import type { Space } from "../api/types";

const space = (id: string): Space => ({
  id,
  name: `Salon ${id}`,
  timezone: "Europe/Paris",
  reactions: [],
  allowCustomReactions: true,
  blindMood: false,
  allowMediaDownload: false,
  desiresEnabled: false,
  desiresExplicitLabels: true,
  eveningMenuEnabled: false,
  createdAt: "2026-06-20T10:00:00.000Z",
});

describe("pickCurrentSpace (#67 — multi-space)", () => {
  const spaces = [space("a"), space("b"), space("c")];

  it("renvoie le salon mémorisé s'il est encore dans la liste", () => {
    expect(pickCurrentSpace(spaces, "b")?.id).toBe("b");
  });

  it("repli sur le premier si l'id mémorisé n'existe plus", () => {
    expect(pickCurrentSpace(spaces, "zzz")?.id).toBe("a");
  });

  it("repli sur le premier si rien n'est mémorisé", () => {
    expect(pickCurrentSpace(spaces, null)?.id).toBe("a");
  });

  it("null si aucun salon", () => {
    expect(pickCurrentSpace([], "a")).toBeNull();
  });
});
