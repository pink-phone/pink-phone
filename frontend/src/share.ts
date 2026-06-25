// Récupération d'un média partagé via la cible de partage PWA (#86).
//
// Flux : l'OS POSTe le fichier sur /share-target → le service worker (src/sw.js)
// le met en cache et redirige vers `/?share-target=1`. Ici, AU CHARGEMENT du
// module (avant que l'app ne modifie l'URL), on détecte le drapeau, on nettoie
// l'URL et on lance la récupération du fichier auprès du SW. `takeSharedFile()`
// renvoie le `File` une seule fois (à l'orchestration, qui ouvre le composer).
//
// ⚠️ Android Chrome uniquement (iOS Safari/PWA ne supporte pas le share target).

let pending: Promise<File | null> | null = null;

function fetchShared(): Promise<File | null> {
  return (async () => {
    try {
      const res = await fetch("/__shared-media");
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size === 0) return null;
      const name = decodeURIComponent(
        res.headers.get("X-Share-Filename") || "media",
      );
      // Consommé une fois : on vide le cache du SW.
      if ("caches" in self) {
        caches
          .open("pp-share")
          .then((c) => c.delete("/__shared-media"))
          .catch(() => {});
      }
      return new File([blob], name, { type: blob.type });
    } catch {
      return null;
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

/** Récupère (une seule fois) le média partagé en attente, s'il y en a un. */
export function takeSharedFile(): Promise<File | null> {
  const p = pending;
  pending = null;
  return p ?? Promise.resolve(null);
}
