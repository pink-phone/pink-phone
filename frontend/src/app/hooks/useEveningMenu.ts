import { useCallback, useEffect, useState } from "react";
import * as api from "../../api/client";
import type { ApiEveningMenuItem } from "../../api/types";

/**
 * « Menu du soir » (#97b) : rituel QUOTIDIEN à double consentement, optionnel par
 * salon. `refetch` stable (`[spaceId, enabled]`) pour le WS / la resync (le menu
 * change aussi au passage de minuit côté serveur, repris à la resync de focus).
 * `toggle` est optimiste ; le serveur renvoie le `matched` réel (double-aveugle).
 */
export function useEveningMenu(spaceId: string, enabled: boolean) {
  const [items, setItems] = useState<ApiEveningMenuItem[]>([]);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      return;
    }
    try {
      setItems(await api.listEveningMenu(spaceId));
    } catch {
      /* best-effort (403 si désactivé entre-temps) */
    }
  }, [spaceId, enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const toggle = async (code: string) => {
    const current = items.find((i) => i.code === code);
    const next = !current?.picked;
    setItems((prev) =>
      prev.map((i) =>
        i.code === code
          ? { ...i, picked: next, matched: next ? i.matched : false }
          : i,
      ),
    );
    try {
      const updated = next
        ? await api.pickEveningMenu(spaceId, code)
        : await api.unpickEveningMenu(spaceId, code);
      setItems((prev) => prev.map((i) => (i.code === code ? updated : i)));
    } catch (e) {
      console.error("bascule du menu du soir échouée", e);
      setItems((prev) =>
        prev.map((i) =>
          i.code === code
            ? { ...i, picked: !next, matched: current?.matched ?? false }
            : i,
        ),
      );
    }
  };

  return { items, refetch, toggle };
}
