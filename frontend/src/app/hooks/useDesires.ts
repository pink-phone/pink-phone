import { useCallback, useEffect, useState } from "react";
import * as api from "../../api/client";
import type { ApiDesire } from "../../api/types";

/**
 * Liste d'envies à double consentement (#99), optionnelle par salon. `refetch`
 * stable (`[spaceId, enabled]`) pour le WS / la resync. Désactivée ⇒ liste vide
 * (on ne tape même pas l'API). `toggleInterest` est optimiste ; le serveur
 * renvoie l'état « matché » réel (je ne peux pas le déduire localement, le
 * double-aveugle me cachant l'intérêt de l'autre).
 */
export function useDesires(spaceId: string, enabled: boolean) {
  const [desires, setDesires] = useState<ApiDesire[]>([]);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setDesires([]);
      return;
    }
    try {
      setDesires(await api.listDesires(spaceId));
    } catch {
      /* best-effort (403 si désactivé entre-temps) */
    }
  }, [spaceId, enabled]);

  // Auto-charge au montage + au changement de salon/activation (comme la banque
  // de suggestions). Le WS / la resync rappellent `refetch` au besoin.
  useEffect(() => {
    refetch();
  }, [refetch]);

  const toggleInterest = async (code: string) => {
    const current = desires.find((d) => d.code === code);
    const next = !current?.interested;
    // Optimiste : on bascule l'intérêt ; le match reste inconnu jusqu'à la
    // réponse serveur (false si on retire).
    setDesires((prev) =>
      prev.map((d) =>
        d.code === code
          ? { ...d, interested: next, matched: next ? d.matched : false }
          : d,
      ),
    );
    try {
      const updated = next
        ? await api.setDesireInterest(spaceId, code)
        : await api.unsetDesireInterest(spaceId, code);
      setDesires((prev) =>
        prev.map((d) => (d.code === code ? updated : d)),
      );
    } catch (e) {
      console.error("bascule d'envie échouée", e);
      // Rollback : on rétablit l'état précédent connu.
      setDesires((prev) =>
        prev.map((d) =>
          d.code === code
            ? { ...d, interested: !next, matched: current?.matched ?? false }
            : d,
        ),
      );
    }
  };

  return { desires, refetch, toggleInterest };
}
