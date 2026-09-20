// Version du build : injectée par le pipeline de release (Dockerfile web :
// VITE_APP_VERSION / VITE_APP_COMMIT), « dev » hors pipeline (npm run dev,
// Storybook, tests). Même forme que la réponse de GET /api/version.

export interface BuildInfo {
  /** `0.0.147` (Forgejo), `gh-1.4.0` (GitHub), `beta`, `ci`, `dev`… */
  version: string;
  /** SHA complet du commit source ; vide hors pipeline. */
  commit: string;
}

/** Build de CE bundle web (figé à la compilation). */
export const WEB_BUILD: BuildInfo = {
  version: (import.meta.env.VITE_APP_VERSION as string | undefined) || "dev",
  commit: (import.meta.env.VITE_APP_COMMIT as string | undefined) ?? "",
};

/** SHA raccourci à 7 caractères (le miroir GitHub réécrit l'historique : un même
 *  commit n'a pas le même SHA côté Forgejo et côté GitHub). */
export const shortCommit = (commit: string): string => commit.slice(0, 7);

/** `0.0.147 · 432f3f5` — ou juste la version quand le commit est inconnu. */
export function formatBuild(b: BuildInfo): string {
  return b.commit ? `${b.version} · ${shortCommit(b.commit)}` : b.version;
}

/**
 * `true` si le bundle web et l'API ne viennent pas du même build : typiquement un
 * front resté en cache (service worker) face à une API redéployée. Jamais vrai
 * pour un build `dev` (front local face à une vraie API) ni si un commit manque.
 */
export function buildsDiffer(a: BuildInfo, b: BuildInfo): boolean {
  if (a.version === "dev" || b.version === "dev") return false;
  if (a.version !== b.version) return true;
  return Boolean(a.commit && b.commit && a.commit !== b.commit);
}
