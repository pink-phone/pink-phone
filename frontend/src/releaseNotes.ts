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
    version: "Menu du soir, nouvelle version",
    date: "2026-10-02",
    items: {
      fr: [
        "Le menu du soir se compose en trois services (Entrée, Plat, Dessert) : chacun affiche ce que vous avez choisi, et « ＋ Ajouter » ouvre une recherche à sélection multiple.",
        "Piochez aussi hors des catégories d'un service avec « Tout le catalogue » ; l'item choisi reste dans le service où vous l'avez ajouté.",
        "Retirer un choix : un ✕ explicite, avec « Annuler » pendant quelques secondes (et une confirmation si cela défait un match).",
        "En mode ouvert, répondez à une proposition par « Partant·e » ou « Pas ce soir » ; chaque état a sa marque (✓ choisi, ＋ proposé, ✨ match, ⊘ refusé).",
        "L'accueil montre le menu de ce soir d'un coup d'œil, service par service.",
        "Réglages › Menu du soir : sa propre section, avec le choix des catégories qui alimentent chaque service (une catégorie peut nourrir plusieurs services).",
        "Le catalogue partagé s'enrichit (positions du Kamasutra et modernes, pratiques), et les envies existantes sont conservées.",
        "En mode aveugle : « J'ai fini » valide votre menu ; quand tout le monde a fini, les choix de chacun sont dévoilés, même sans match — et vous êtes prévenu·e. Vous pouvez ensuite valider ou refuser les idées de l'autre.",
        "Valider le sélecteur ne vous renvoie plus à l'accueil, et le mode aveugle ne laisse plus rien filtrer d'un choix non matché.",
      ],
      en: [
        "Tonight's menu is now built in three courses (Starter, Main, Dessert): each shows what you picked, and “＋ Add” opens a multi-select search.",
        "Also pick outside a course's categories with “Whole catalog”; the item stays in the course where you added it.",
        "Removing a pick: an explicit ✕, with “Undo” for a few seconds (and a confirmation if it undoes a match).",
        "In open mode, answer a proposal with “I'm in” or “Not tonight”; each state has its own mark (✓ picked, ＋ proposed, ✨ match, ⊘ declined).",
        "The home screen shows tonight's menu at a glance, course by course.",
        "Settings › Tonight's menu: its own section, with the categories feeding each course (a category can feed several courses).",
        "The shared catalog grows (Kamasutra and modern positions, practices), and your existing wishes are kept.",
        "In blind mode: “I'm done” confirms your menu; once everyone is done, everyone's picks are revealed, even without a match — and you get notified. You can then accept or decline each other's ideas.",
        "Confirming the picker no longer sends you back to the home screen, and blind mode no longer leaks anything about an unmatched pick.",
      ],
    },
  },
  {
    version: "Médias plein écran",
    date: "2026-09-30",
    items: {
      fr: [
        "Touchez une photo ou une vidéo d'un post pour l'ouvrir en plein écran.",
        "Faites pivoter à la main un média paysage pour qu'il remplisse l'écran.",
        "Un halo aux couleurs du thème entoure le média en plein écran.",
      ],
      en: [
        "Tap a post's photo or video to open it full screen.",
        "Manually rotate a landscape media so it fills the screen.",
        "A glow in your theme's colors surrounds the full-screen media.",
      ],
    },
  },
  {
    version: "Centre de notifications",
    date: "2026-09-23",
    items: {
      fr: [
        "Un centre de notifications dans l'accueil (🔔) : tout l'historique, marquable lu ou tout lu d'un coup.",
        "Taper une notification vous amène directement dessus : le post ou le défi concerné se surligne, le fil de commentaires s'ouvre tout seul.",
        "Les photos gardent leur bon format à l'affichage (fini le recadrage forcé).",
      ],
      en: [
        "A notification center on the home screen (🔔): the full history, markable as read one by one or all at once.",
        "Tapping a notification takes you straight to it: the post or challenge highlights, the comment thread opens on its own.",
        "Photos keep their natural shape when shown (no more forced crop).",
      ],
    },
  },
  {
    version: "Sécurité renforcée",
    date: "2026-09-02",
    items: {
      fr: [
        "Limite de tentatives sur la connexion, contre les essais automatisés.",
        "Les données de localisation (GPS) sont retirées des photos avant l'envoi.",
        "Renforcements supplémentaires côté serveur (limites de connexions, en-têtes de sécurité).",
      ],
      en: [
        "Login attempts are now rate-limited, against automated guessing.",
        "Location data (GPS) is stripped from photos before upload.",
        "Extra server-side hardening (connection limits, security headers).",
      ],
    },
  },
  {
    version: "Accueil épuré",
    date: "2026-06-30",
    items: {
      fr: [
        "L'accueil se consulte d'un coup d'œil ; écrire un post, un défi ou une humeur se fait dans une feuille dédiée.",
        "Favoris (★) pour retrouver ses posts préférés dans le blog.",
        "Brouillons regroupés dans une section repliable.",
        "Le prénom affiché se change dans Réglages › Mon compte.",
      ],
      en: [
        "The home screen is now a glance, not a form — writing a post, challenge or mood happens in its own sheet.",
        "Favorites (★) to find your favorite posts again in the blog.",
        "Drafts grouped in a collapsible section.",
        "Your displayed first name can be changed in Settings › My account.",
      ],
    },
  },
  {
    version: "Rituels & envies",
    date: "2026-06-29",
    items: {
      fr: [
        "Dossier Noir : une bucket list à double consentement — cochez vos envies en secret, elles ne se révèlent qu'en cas d'accord mutuel.",
        "Menu du soir : un rituel quotidien, chacun coche en privé, un match se révèle si vous êtes sur la même longueur d'onde.",
        "Mots doux : glissez un petit mot à l'autre, tout de suite ou à une date choisie.",
      ],
      en: [
        "Dossier Noir: a double-consent bucket list — check your desires in secret, revealed only when you both agree.",
        "Evening menu: a daily ritual, everyone picks privately, a match reveals itself when you're on the same page.",
        "Love notes: slip a little word to the other, right away or on a chosen date.",
      ],
    },
  },
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
