// Brouillon local du post en cours de rédaction : texte seulement (titre + corps),
// gardé sur l'appareil pour survivre à un rechargement / une PWA tuée par l'OS.
// Les médias ne sont pas conservés (fichiers non sérialisables).
//
// Le texte est intime et stocké EN CLAIR dans localStorage (même niveau de
// protection que le jeton) : on l'efface dès l'envoi et à la déconnexion.

const PREFIX = "pp_post_draft:";

export interface PostTextDraft {
  title: string;
  body: string;
}

const key = (userId: string, spaceId: string) => `${PREFIX}${userId}:${spaceId}`;

export function loadPostDraft(
  userId: string,
  spaceId: string,
): PostTextDraft | undefined {
  try {
    const raw = localStorage.getItem(key(userId, spaceId));
    if (!raw) return undefined;
    const d = JSON.parse(raw) as Partial<PostTextDraft>;
    if (typeof d.title !== "string" || typeof d.body !== "string") return undefined;
    return { title: d.title, body: d.body };
  } catch {
    return undefined;
  }
}

/** Enregistre le brouillon ; un brouillon vide supprime l'entrée. */
export function savePostDraft(
  userId: string,
  spaceId: string,
  draft: PostTextDraft,
): void {
  try {
    if (!draft.title.trim() && !draft.body.trim()) {
      localStorage.removeItem(key(userId, spaceId));
    } else {
      localStorage.setItem(key(userId, spaceId), JSON.stringify(draft));
    }
  } catch {
    // Stockage indisponible / plein : le brouillon reste simplement en mémoire.
  }
}

export function clearPostDraft(userId: string, spaceId: string): void {
  try {
    localStorage.removeItem(key(userId, spaceId));
  } catch {
    // ignoré
  }
}

/** Efface tous les brouillons de l'appareil (déconnexion). */
export function clearAllPostDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignoré
  }
}
