import { useEffect, useRef } from "react";

/**
 * Rend une surface (sheet, écran réglages…) refermable par le **bouton retour
 * Android** et le **swipe-retour iOS** (qui déclenchent `popstate`).
 *
 * À l'ouverture, on empile une entrée d'historique ; un retour la dépile et
 * appelle `close`. Si la surface est fermée autrement (✕, Échap…), on consomme
 * l'entrée empilée pour ne pas laisser d'historique fantôme.
 *
 * ⚠️ NON StrictMode-safe en DEV (REACT-05) : le double-invoke de StrictMode
 * (mount → cleanup → remount) peut empiler une entrée fantôme transitoire. C'est
 * **inoffensif en production** (StrictMode ne double-invoke qu'en dev), et toute
 * tentative de « corriger » en manipulant `pushState`/`back` autour du
 * double-invoke risque d'introduire de vrais bugs de navigation en prod — on
 * accepte donc le comportement dev plutôt que de fragiliser la navigation réelle.
 */
// Surfaces ouvertes, de la plus ancienne à la plus récente (imbrication : un
// sélecteur ouvert PAR-DESSUS un écran lui-même refermable par retour). Seule la
// plus récente réagit à un retour ; et le `history.back()` d'une fermeture
// programmatique ne doit fermer AUCUNE surface parente.
const stack: symbol[] = [];
let ignorePop = false;

export function useBackClose(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const id = Symbol("overlay");
    stack.push(id);
    let poppedByBack = false;
    window.history.pushState({ ppOverlay: true }, "");
    const onPop = () => {
      if (ignorePop) return; // écho de la fermeture programmatique d'une surface fille
      if (stack[stack.length - 1] !== id) return; // seule la surface du dessus se ferme
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      // Fermeture programmatique (✕, Valider…) : notre entrée d'historique est
      // encore là → on la consomme, sans que les surfaces parentes y réagissent.
      if (!poppedByBack) {
        ignorePop = true;
        window.addEventListener("popstate", () => (ignorePop = false), { once: true });
        window.history.back();
      }
    };
  }, [open]);
}
