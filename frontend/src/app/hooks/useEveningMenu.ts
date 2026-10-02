import { useCallback, useEffect, useState } from "react";
import * as api from "../../api/client";
import type { ApiEveningMenuItem } from "../../api/types";

type Course = "starter" | "main" | "dessert";

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

  // `course` : service où l'on ajoute le choix (piocher hors catégorie) ; absent
  // = service par défaut de l'item.
  const toggle = async (code: string, course?: Course) => {
    const current = items.find((i) => i.code === code);
    const next = !current?.picked;
    setItems((prev) =>
      prev.map((i) =>
        i.code === code
          ? {
              ...i,
              picked: next,
              matched: next ? i.matched : false,
              course: next && course ? course : i.course,
            }
          : i,
      ),
    );
    try {
      const updated = next
        ? await api.pickEveningMenu(spaceId, code, "want", course)
        : await api.unpickEveningMenu(spaceId, code);
      setItems((prev) => prev.map((i) => (i.code === code ? updated : i)));
    } catch (e) {
      console.error("bascule du menu du soir échouée", e);
      setItems((prev) =>
        prev.map((i) =>
          i.code === code
            ? current ?? i
            : i,
        ),
      );
    }
  };

  // Mode ouvert (#0040) : refuse explicitement une proposition (la mienne ou
  // celle du/de la partenaire). Optimiste ; indisponible en mode aveugle
  // (l'écran ne propose ce bouton que si `partnerWants`, jamais vrai là-bas).
  const refuse = async (code: string) => {
    const current = items.find((i) => i.code === code);
    setItems((prev) =>
      prev.map((i) =>
        i.code === code
          ? { ...i, picked: false, matched: false, refused: true }
          : i,
      ),
    );
    try {
      const updated = await api.pickEveningMenu(spaceId, code, "refused");
      setItems((prev) => prev.map((i) => (i.code === code ? updated : i)));
    } catch (e) {
      console.error("refus du menu du soir échoué", e);
      if (current) {
        setItems((prev) => prev.map((i) => (i.code === code ? current : i)));
      }
    }
  };

  return { items, refetch, toggle, refuse };
}
