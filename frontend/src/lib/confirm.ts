// Confirmation utilisateur isolée derrière une fonction remplaçable : la couche
// orchestration ne dépend plus directement du global bloquant `window.confirm`
// (concern UI ramené à la frontière, seam testable). À terme, remplaçable par
// une boîte de dialogue « felted » sans toucher aux appelants.
export function confirmAction(message: string): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }
  return window.confirm(message);
}
