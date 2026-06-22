import type { Space } from "../api/types";

/** Clé localStorage du salon courant (multi-space, #67). */
export const CURRENT_SPACE_KEY = "pp_space";

/**
 * Choisit le salon courant : celui mémorisé (`storedId`) s'il est encore dans la
 * liste, sinon le premier. `null` si la liste est vide. Pur → testable (#67).
 */
export function pickCurrentSpace(
  spaces: Space[],
  storedId: string | null,
): Space | null {
  if (spaces.length === 0) return null;
  return spaces.find((s) => s.id === storedId) ?? spaces[0];
}
