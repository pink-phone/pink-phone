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

  // Pose (ou retire, si déjà posé) un stance : « want » (envie) ou « against »
  // (contre/limite). Optimiste ; le serveur renvoie l'état réel (match/limite que
  // je ne peux pas toujours déduire à cause du double-aveugle).
  const setStance = async (code: string, stance: "want" | "against") => {
    const current = desires.find((d) => d.code === code);
    const already =
      stance === "want" ? current?.interested : current?.against;
    setDesires((prev) =>
      prev.map((d) =>
        d.code === code
          ? {
              ...d,
              interested: already ? false : stance === "want",
              against: already ? false : stance === "against",
              matched:
                already || stance === "against" ? false : d.matched,
              // Poser « contre » = limite certaine ; sinon on garde (serveur corrige).
              limit: stance === "against" && !already ? true : d.limit,
            }
          : d,
      ),
    );
    try {
      const updated = already
        ? await api.clearDesireStance(spaceId, code)
        : await api.setDesireStance(spaceId, code, stance);
      setDesires((prev) => prev.map((d) => (d.code === code ? updated : d)));
    } catch (e) {
      console.error("bascule de stance échouée", e);
      refetch(); // resync (l'état multi-champs est plus sûr rechargé)
    }
  };

  // « ✓ Réalisé » niveau salon (couple) — optimiste. Indépendant de l'intérêt.
  const toggleDone = async (code: string) => {
    const current = desires.find((d) => d.code === code);
    const next = !current?.done;
    setDesires((prev) =>
      prev.map((d) => (d.code === code ? { ...d, done: next } : d)),
    );
    try {
      const updated = next
        ? await api.setDesireDone(spaceId, code)
        : await api.unsetDesireDone(spaceId, code);
      setDesires((prev) => prev.map((d) => (d.code === code ? updated : d)));
    } catch (e) {
      console.error("bascule « réalisé » échouée", e);
      setDesires((prev) =>
        prev.map((d) => (d.code === code ? { ...d, done: !next } : d)),
      );
    }
  };

  return { desires, refetch, setStance, toggleDone };
}
