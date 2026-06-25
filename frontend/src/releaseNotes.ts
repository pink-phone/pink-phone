// Notes de version affichées dans les Réglages (#90).
//
// Contenu **bundlé** (offline, simple) : figé à la version déployée — ce qui est
// exactement ce que l'utilisateur a sous la main. Curé à la main, bilingue
// (FR source + EN), du plus récent au plus ancien. À compléter à chaque lot de
// features. _(évolution possible : générer depuis les notes CI #74.)_

export interface ReleaseNote {
  /** Étiquette de version lisible (sert aussi d'id pour le badge « nouveautés »). */
  version: string;
  /** Date ISO (affichée via Intl, localisée). */
  date: string;
  /** Points marquants, par langue (chaîne user-facing → i18n). */
  items: { fr: string[]; en: string[] };
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "Galeries & partage",
    date: "2026-06-25",
    items: {
      fr: [
        "Plusieurs photos/vidéos par post (jusqu'à 10), affichées en galerie et réordonnables.",
        "Partage natif Android : « Partager → Pink Phone » crée un nouveau post.",
        "Vidéos muettes par défaut, avec un bouton son.",
        "Code d'invitation plus humain à dicter (ex. EmberVelvet#7).",
        "Cet écran : les notes de version, dans les Réglages.",
      ],
      en: [
        "Several photos/videos per post (up to 10), shown as a gallery and reorderable.",
        "Android native share: “Share → Pink Phone” creates a new post.",
        "Videos muted by default, with a sound button.",
        "Friendlier invite code you can say out loud (e.g. EmberVelvet#7).",
        "This screen: release notes, in Settings.",
      ],
    },
  },
  {
    version: "Lecture & médias",
    date: "2026-06-24",
    items: {
      fr: [
        "Ligne « non lus » dans le blog, les défis et les commentaires.",
        "Petits messages de salon : nouveau membre, téléchargement activé.",
        "Téléchargement des médias, en option (par salon ou par post).",
      ],
      en: [
        "“Unread” divider in the blog, challenges and comments.",
        "Little room notices: a new member, downloads turned on.",
        "Optional media download (per room or per post).",
      ],
    },
  },
  {
    version: "Confort & sécurité",
    date: "2026-06-23",
    items: {
      fr: [
        "Déverrouillage biométrique (Face ID / empreinte) en plus du code.",
        "Modifier ou supprimer un commentaire.",
        "Brouillons mieux distingués dans le fil.",
      ],
      en: [
        "Biometric unlock (Face ID / fingerprint) on top of the passcode.",
        "Edit or delete a comment.",
        "Drafts stand out more clearly in the feed.",
      ],
    },
  },
];

/** Version courante = la plus récente (sert au badge « nouveautés »). */
export const CURRENT_VERSION = RELEASE_NOTES[0]?.version ?? "";
