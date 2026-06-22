import { useCallback, useRef, useState } from "react";
import * as api from "../../api/client";
import type { ApiChallenge } from "../../api/types";
import type { ChallengeDraft } from "../../components/ChallengeComposer/ChallengeComposer";
import type { ChallengeStatus } from "../../domain/types";
import { appendOlder, mergeHead } from "./paginate";

/**
 * Domaine « défis » : liste paginée (curseur) + machine à états + CRUD. Les
 * `add`/`edit` renvoient un booléen de succès (l'appelant ferme la feuille
 * seulement alors). La confirmation de suppression reste à l'appelant (UI/i18n).
 */
export function useChallenges(spaceId: string) {
  const [challenges, setChallenges] = useState<ApiChallenge[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Des pages plus anciennes ont-elles déjà été chargées ? Si oui, un refetch de
  // la tête (resync WS) ne doit pas réécraser `hasMore` avec celui de la 1ʳᵉ page.
  const loadedOlder = useRef(false);

  // Refetch de la tête : reflète les créations/suppressions distantes et préserve
  // les pages plus anciennes déjà chargées (modèle resync temps-réel).
  const refetch = useCallback(async () => {
    try {
      const page = await api.listChallenges(spaceId);
      setChallenges((prev) => mergeHead(page.items, prev));
      if (!loadedOlder.current) setHasMore(page.hasMore);
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  // Charge la page suivante (éléments plus anciens que le dernier affiché).
  const loadMore = async () => {
    const cursor = challenges[challenges.length - 1]?.createdAt;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.listChallenges(spaceId, cursor);
      loadedOlder.current = true;
      setChallenges((prev) => appendOlder(prev, page.items));
      setHasMore(page.hasMore);
    } catch (e) {
      console.error("chargement de défis plus anciens échoué", e);
    } finally {
      setLoadingMore(false);
    }
  };

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

  return { challenges, hasMore, loadingMore, refetch, loadMore, add, transition, edit, remove };
}
