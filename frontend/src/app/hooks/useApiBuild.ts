import { useEffect, useState } from "react";
import * as api from "../../api/client";
import type { ApiBuildState } from "../../components/BuildInfo/BuildInfo";

/**
 * Version de l'API, lue à chaque fois que `enabled` passe à vrai (ouverture des
 * Réglages) : un redéploiement pendant que l'app était ouverte se voit ainsi à
 * la prochaine ouverture, sans requête au démarrage de l'app.
 */
export function useApiBuild(enabled: boolean): ApiBuildState {
  const [state, setState] = useState<ApiBuildState>("loading");

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const v = await api.getApiVersion();
        if (alive) setState(v);
      } catch {
        if (alive) setState("unavailable");
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return state;
}
