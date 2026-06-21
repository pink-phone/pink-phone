import { useCallback, useState } from "react";
import * as api from "../../api/client";
import type { MoodEntry } from "../../api/types";

/**
 * Humeurs du salon (« météo sexuelle »). En mode « surprise mutuelle »
 * (`blindMood`), poser/retirer mon humeur change ce que le serveur me renvoie
 * des autres → on resynchronise après coup. `refetch` est stable (`[spaceId]`).
 */
export function useMoods(spaceId: string, userId: string, blindMood: boolean) {
  const [moods, setMoods] = useState<MoodEntry[]>([]);

  const refetch = useCallback(async () => {
    try {
      setMoods(await api.listMoods(spaceId));
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  const setMood = useCallback(
    (mood: string) => {
      api
        .setMood(spaceId, mood)
        .then((entry) => {
          setMoods((prev) => [
            ...prev.filter((m) => m.userId !== entry.userId),
            entry,
          ]);
          // En mode « à l'aveugle », poser mon humeur révèle celle du partenaire.
          if (blindMood) api.listMoods(spaceId).then(setMoods).catch(() => {});
        })
        .catch((e) => console.error("mise à jour du mood échouée", e));
    },
    [spaceId, blindMood],
  );

  const clearMood = useCallback(() => {
    api
      .clearMood(spaceId)
      .then(() => {
        setMoods((prev) => prev.filter((m) => m.userId !== userId));
        // En « surprise mutuelle », ne plus avoir voté re-masque l'humeur de l'autre.
        if (blindMood) api.listMoods(spaceId).then(setMoods).catch(() => {});
      })
      .catch((e) => console.error("retrait du mood échoué", e));
  }, [spaceId, userId, blindMood]);

  return { moods, refetch, setMood, clearMood };
}
