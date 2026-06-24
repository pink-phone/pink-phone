// Helpers de fusion pour les listes paginées par curseur (RUST-12 / API-11).
//
// Le modèle temps-réel resynchronise en refetchant la « tête » (la page la plus
// récente) ; il faut la fusionner avec les pages plus anciennes déjà chargées
// sans les perdre, tout en reflétant les créations/suppressions distantes dans
// la fenêtre fraîchement refetchée.

export interface Paged {
  id: string;
  createdAt: string;
}

/**
 * Listes triées du plus RÉCENT au plus ancien (posts, défis). `head` est la page
 * la plus récente, refetchée : elle fait autorité sur sa fenêtre `[cutoff, top]`
 * (un élément de `prev` dans cette fenêtre absent de `head` a été supprimé → on
 * le retire) ; les éléments de `prev` plus anciens que `cutoff` sont conservés.
 */
export function mergeHead<T extends Paged>(head: T[], prev: T[]): T[] {
  if (head.length === 0) return prev;
  const cutoff = head[head.length - 1].createdAt;
  const headIds = new Set(head.map((x) => x.id));
  // `<=` + exclusion par id (REACT2-11) : un élément de `prev` à `createdAt`
  // EXACTEMENT égal au cutoff, mais absent de `head` (collision d'horodatage en
  // limite de page), serait perdu avec un `<` strict. L'exclusion par id évite
  // de dupliquer ceux qui SONT dans head.
  const older = prev.filter((p) => p.createdAt <= cutoff && !headIds.has(p.id));
  return [...head, ...older];
}

/**
 * Variante pour les listes affichées du plus ANCIEN au plus récent (commentaires) :
 * `head` est la fenêtre la plus récente (en fin de liste), `prev` les plus anciens
 * déjà chargés en tête. Miroir de `mergeHead`.
 */
export function mergeTail<T extends Paged>(head: T[], prev: T[]): T[] {
  if (head.length === 0) return prev;
  const cutoff = head[0].createdAt;
  const headIds = new Set(head.map((x) => x.id));
  // `<=` + exclusion par id (REACT2-11), miroir de `mergeHead`.
  const older = prev.filter((p) => p.createdAt <= cutoff && !headIds.has(p.id));
  return [...older, ...head];
}

/** Concatène une page d'éléments plus anciens en dédupliquant par id. */
export function appendOlder<T extends Paged>(prev: T[], older: T[]): T[] {
  const seen = new Set(prev.map((x) => x.id));
  return [...prev, ...older.filter((x) => !seen.has(x.id))];
}
