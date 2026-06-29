import { useCallback, useState } from "react";
import * as api from "../../api/client";
import type { ApiLoveNote } from "../../api/types";

/**
 * Boîte à « mots doux » (#102) : petits post-it du salon. `refetch` stable
 * (`[spaceId]`) pour le WS / la resync (un mot différé peut se déverrouiller
 * pendant une absence → repris à la resync). `add` renvoie un booléen de succès.
 */
export function useLoveNotes(spaceId: string) {
  const [notes, setNotes] = useState<ApiLoveNote[]>([]);

  const refetch = useCallback(async () => {
    try {
      setNotes(await api.listLoveNotes(spaceId));
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  const add = async (body: string, openAt?: string): Promise<boolean> => {
    try {
      const note = await api.createLoveNote(spaceId, { body, openAt });
      setNotes((prev) => [note, ...prev]);
      return true;
    } catch (e) {
      console.error("envoi du mot doux échoué", e);
      return false;
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteLoveNote(spaceId, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.error("suppression du mot doux échouée", e);
    }
  };

  return { notes, refetch, add, remove };
}
