import { useEffect, useRef } from "react";

/**
 * Rend une surface (sheet, écran réglages…) refermable par le **bouton retour
 * Android** et le **swipe-retour iOS** (qui déclenchent `popstate`).
 *
 * À l'ouverture, on empile une entrée d'historique ; un retour la dépile et
 * appelle `close`. Si la surface est fermée autrement (✕, Échap…), on consomme
 * l'entrée empilée pour ne pas laisser d'historique fantôme.
 */
export function useBackClose(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ppOverlay: true }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Fermeture programmatique (pas via retour) : notre entrée est encore là.
      if (window.history.state?.ppOverlay) window.history.back();
    };
  }, [open]);
}
