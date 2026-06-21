import { useCallback, useState } from "react";
import * as api from "../../api/client";
import type { SeenEntry } from "../../api/types";

export type SeenFeature = "blog" | "challenges";

/**
 * État « vu » du salon (badges nouveautés + accusés de lecture). `refetch` est
 * stable (déps `[spaceId]`) pour pouvoir être appelé depuis le WS / la resync
 * sans recréer leurs effets.
 */
export function useSeen(spaceId: string, userId: string) {
  const [seen, setSeen] = useState<SeenEntry[]>([]);

  const refetch = useCallback(async () => {
    try {
      setSeen(await api.listSeen(spaceId));
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  // Marque un fil comme vu (met à jour le "vu" local de l'utilisateur courant).
  const markSeen = useCallback(
    (feature: SeenFeature) => {
      api
        .markSeen(spaceId, feature)
        .then((entry) =>
          setSeen((prev) => [
            ...prev.filter(
              (s) => !(s.userId === userId && s.feature === feature),
            ),
            entry,
          ]),
        )
        .catch(() => {});
    },
    [spaceId, userId],
  );

  return { seen, refetch, markSeen };
}
