// Récupération des médias partagés via la cible de partage PWA (#86/#87).
//
// Flux : l'OS POSTe le(s) fichier(s) sur /share-target → le service worker
// (src/sw.js) les met en cache et redirige vers `/?share-target=1`. Ici, AU
// CHARGEMENT du module (avant que l'app ne modifie l'URL), on détecte le
// drapeau, on nettoie l'URL et on lance la récupération des fichiers auprès du
// SW. `takeSharedFiles()` renvoie les `File[]` une seule fois (à
// l'orchestration, qui ouvre le composer avec la galerie pré-remplie).
//
// ⚠️ Android Chrome uniquement (iOS Safari/PWA ne supporte pas le share target).

let pending: Promise<File[]> | null = null;

const SHARE_KEY = "/__shared-media";

async function fetchOne(path: string): Promise<File | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    const name = decodeURIComponent(
      res.headers.get("X-Share-Filename") || "media",
    );
    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}

function fetchShared(): Promise<File[]> {
  return (async () => {
    try {
      const res = await fetch(SHARE_KEY);
      if (!res.ok) return [];
      const { count } = (await res.json()) as { count?: number };
      const n = typeof count === "number" ? count : 0;
      const files: File[] = [];
      for (let i = 0; i < n; i++) {
        const f = await fetchOne(`${SHARE_KEY}/${i}`);
        if (f) files.push(f);
      }
      // Consommé une fois : on vide le cache du SW.
      if ("caches" in self) {
        caches.delete("pp-share").catch(() => {});
      }
      return files;
    } catch {
      return [];
    }
  })();
}

if (
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("share-target")
) {
  // Nettoie l'URL tout de suite (le drapeau ne doit pas resservir).
  history.replaceState(null, "", location.pathname + location.hash);
  pending = fetchShared();
}

/** Récupère (une seule fois) les médias partagés en attente, s'il y en a. */
export function takeSharedFiles(): Promise<File[]> {
  const p = pending;
  pending = null;
  return p ?? Promise.resolve([]);
}
