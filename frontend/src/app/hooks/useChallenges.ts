import { useCallback, useState } from "react";
import * as api from "../../api/client";
import type { ApiChallenge } from "../../api/types";
import type { ChallengeDraft } from "../../components/ChallengeComposer/ChallengeComposer";
import type { ChallengeStatus } from "../../domain/types";

/**
 * Domaine « défis » : liste + machine à états + CRUD. Les `add`/`edit`
 * renvoient un booléen de succès (l'appelant ferme la feuille seulement alors).
 * La confirmation de suppression reste à l'appelant (concern UI/i18n).
 */
export function useChallenges(spaceId: string) {
  const [challenges, setChallenges] = useState<ApiChallenge[]>([]);

  const refetch = useCallback(async () => {
    try {
      setChallenges(await api.listChallenges(spaceId));
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  const add = async (draft: ChallengeDraft): Promise<boolean> => {
    try {
      const challenge = await api.createChallenge(spaceId, {
        title: draft.title,
        description: draft.description,
        intensity: draft.intensity,
        deadlineLabel: draft.deadlineLabel,
      });
      setChallenges((prev) => [challenge, ...prev]);
      return true;
    } catch (e) {
      console.error("proposition de défi échouée", e);
      return false;
    }
  };

  const transition = (id: string, status: ChallengeStatus) => {
    api
      .transitionChallenge(spaceId, id, status)
      .then((updated) =>
        setChallenges((prev) => prev.map((c) => (c.id === id ? updated : c))),
      )
      .catch((e) => console.error("transition de défi échouée", e));
  };

  const edit = async (id: string, draft: ChallengeDraft): Promise<boolean> => {
    try {
      const updated = await api.updateChallenge(spaceId, id, {
        title: draft.title,
        description: draft.description,
        intensity: draft.intensity,
        deadlineLabel: draft.deadlineLabel,
      });
      setChallenges((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return true;
    } catch (e) {
      console.error("édition de défi échouée", e);
      return false;
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteChallenge(spaceId, id);
      setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("suppression du défi échouée", e);
    }
  };

  return { challenges, refetch, add, transition, edit, remove };
}
