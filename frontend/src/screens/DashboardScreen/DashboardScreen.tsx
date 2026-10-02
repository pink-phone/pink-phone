import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { Button } from "../../components/Button/Button";
import { LoveNoteWall } from "../../components/LoveNoteWall/LoveNoteWall";
import { FireEmbers } from "../../components/FireEmbers/FireEmbers";
import { MOODS } from "../../components/MoodSelector/moods";
import { parseCustomMood } from "../../components/MoodSelector/MoodSelector";
import { cn } from "../../lib/cn";

/** Au-delà de ce nombre d'items par service, la tuile en montre PREVIEW_MAX-1 puis « +N ». */
const PREVIEW_MAX = 6;
import type { EveningMenuPreviewRow, Person } from "../../types/view";
import type { ApiLoveNote } from "../../api/types";

/** Une autre personne du salon + son humeur du jour (multi-partenaires #52). */
export interface DashboardPartner extends Person {
  id: string;
  /** Id de mood prédéfini, emoji libre, ou null (pas encore d'humeur). */
  mood: string | null;
  timeLabel?: string;
  /** Vote à l'aveugle : humeur masquée tant que je n'ai pas posé la mienne. */
  moodHidden?: boolean;
}

export interface DashboardScreenProps {
  spaceName: string;
  /**
   * Les AUTRES membres du salon (hors moi). Vide tant que personne n'a rejoint.
   * 1 = couple (formulation au singulier), ≥ 2 = groupe (formulation au pluriel).
   */
  partners: DashboardPartner[];
  /** Code d'invitation lisible généré (à partager) — null tant qu'on n'a pas cliqué. */
  inviteCode?: string | null;
  /** Génère un code d'invitation à usage unique (#89). */
  onCreateInvite?: () => void;
  /** Mood courant : id prédéfini OU emoji libre (mood custom). */
  myMood: string | null;
  /** Ouvre la feuille de saisie d'humeur (au tap sur ma carte météo). */
  onOpenMood?: () => void;
  onOpenSettings?: () => void;
  /** Ouvre le centre de notifications. */
  onOpenNotifications?: () => void;
  /** Notifications non lues (toutes catégories) — badge sur la cloche. */
  unreadNotifications?: number;
  /** Nouveautés non vues (badges "Du nouveau"). */
  newPosts?: number;
  /** Posts ayant reçu un nouveau commentaire de l'autre. */
  newComments?: number;
  newChallenges?: number;
  /** Ouvre un fil depuis le dashboard (au clic sur une pastille de nouveauté). */
  onOpen?: (tab: "blog" | "challenges") => void;
  /** Notices du salon non vues (#84/#85) — déjà filtrées par l'orchestration. */
  notices?: { id: string; kind: string; actorName?: string }[];
  /** Menu du soir activé pour le salon (#97b) → affiche l'entrée dédiée. */
  eveningMenuEnabled?: boolean;
  /** Nombre de matchs du soir (réciproques) → badge + braise sur l'entrée. */
  eveningMenuMatches?: number;
  /** Aperçu du menu de ce soir (114a), visible sans ouvrir l'écran dédié. */
  eveningMenuPreview?: EveningMenuPreviewRow[];
  /** Ouvre l'écran dédié « Menu du soir » (#97b). */
  onOpenEveningMenu?: () => void;
  /** Id de l'utilisateur courant (pour distinguer mes mots doux). */
  userId?: string;
  /** Mots doux du salon (#102). */
  loveNotes?: ApiLoveNote[];
  /** Ouvre le composer de mot doux (feuille). */
  onComposeLoveNote?: () => void;
  onDeleteLoveNote?: (id: string) => void;
  /** Mot doux à surligner brièvement (arrivée depuis une notification). */
  highlightedLoveNoteId?: string;
}

/** Une "vignette météo" pour l'humeur d'une personne (ou son absence). Ma propre
 *  carte est cliquable (`onClick`) → ouvre la feuille de saisie d'humeur (#redesign
 *  dashboard : la saisie passe par un tap sur la carte, plus de sélecteur inline). */
function MoodCard({
  name,
  moodId,
  timeLabel,
  hidden = false,
  onClick,
}: {
  name: string;
  /** Id prédéfini, emoji libre, ou null (pas encore d'humeur). */
  moodId: string | null;
  timeLabel?: string;
  /** Vote à l'aveugle : humeur masquée tant que je n'ai pas posé la mienne. */
  hidden?: boolean;
  /** Rend la carte cliquable (ma carte → saisir/changer mon humeur). */
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const predef = moodId ? MOODS.find((m) => m.id === moodId) : undefined;
  const isCustom = !!moodId && !predef;
  const custom = isCustom ? parseCustomMood(moodId as string) : null;
  const hot = !hidden && predef?.id === "veryHot";
  const has = !hidden && !!moodId;

  const inner = (
    <Surface
      tone={has ? "deep" : "velvet"}
      radius="2xl"
      className={cn(
        "relative h-full overflow-hidden",
        hot && "shadow-ember animate-ember-breathe motion-reduce:animate-none",
      )}
    >
      {hot && <FireEmbers count={6} />}
      <div className="relative z-10 flex flex-col items-center gap-1 text-center">
        {hidden ? (
          <>
            {/* Cache générique flouté : on devine une humeur, sans la lire
                (le vrai mood n'est même pas envoyé tant que je n'ai pas voté). */}
            <span aria-hidden className="select-none text-4xl blur-[2px]">
              🤫
            </span>
            <p className="font-serif text-base text-blush-100">{name}</p>
            <p className="text-xs text-taupe-300">{t("dashboard.moodHidden")}</p>
          </>
        ) : (
          <>
            <span aria-hidden className="text-4xl">
              {predef ? predef.emoji : custom ? custom.emoji : "…"}
            </span>
            <p className="font-serif text-base text-blush-100">{name}</p>
            {moodId ? (
              <>
                <p className="text-sm text-blush-200">
                  {predef
                    ? t(`moods.${predef.id}`)
                    : custom?.label || t("moods.custom")}
                </p>
                {timeLabel && (
                  <p className="text-xs text-blush-200/70">
                    {t("dashboard.updatedAt", { time: timeLabel })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-taupe-300">
                {onClick ? t("dashboard.setMoodHint") : t("dashboard.noMoodYet")}
              </p>
            )}
          </>
        )}
      </div>
    </Surface>
  );

  if (!onClick) return inner;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("dashboard.editMoodAria")}
      className="block h-full w-full rounded-2xl text-left transition-transform duration-300 ease-felt hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
    >
      {inner}
    </button>
  );
}

/** Accueil du Space : la météo sexuelle d'un coup d'œil. */
export function DashboardScreen({
  spaceName,
  partners,
  inviteCode,
  onCreateInvite,
  myMood,
  onOpenMood,
  onOpenSettings,
  onOpenNotifications,
  unreadNotifications = 0,
  newPosts = 0,
  newComments = 0,
  newChallenges = 0,
  onOpen,
  notices = [],
  eveningMenuEnabled = false,
  eveningMenuMatches = 0,
  eveningMenuPreview = [],
  onOpenEveningMenu,
  userId = "",
  loveNotes = [],
  onComposeLoveNote,
  onDeleteLoveNote,
  highlightedLoveNoteId,
}: DashboardScreenProps) {
  const { t } = useTranslation();
  // Notices connues (kind → message + icône) ; les inconnues sont ignorées.
  const NOTICE_META: Record<string, { icon: string; key: string }> = {
    member_joined: { icon: "👋", key: "notice.memberJoined" },
    download_enabled: { icon: "⬇️", key: "notice.downloadEnabled" },
  };
  const shownNotices = notices.filter((n) => NOTICE_META[n.kind]);

  return (
    <div className="space-y-v3-6">
      <header className="relative pt-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-taupe-400">
          {t("dashboard.today")}
        </p>
        <h1 className="mt-1 font-serif text-3xl text-blush-100">{spaceName}</h1>
        {onOpenNotifications && (
          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label={t("notifCenter.aria")}
            className="absolute left-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-xl text-taupe-300 transition-colors duration-300 ease-felt hover:text-spice-300"
          >
            🔔
            {unreadNotifications > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-spice-500 px-1 text-[10px] font-semibold text-blush-50">
                {unreadNotifications}
              </span>
            )}
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t("dashboard.settings")}
            className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-xl text-taupe-300 transition-colors duration-300 ease-felt hover:text-spice-300"
          >
            ⚙️
          </button>
        )}
      </header>

      {partners.length > 0 ? (
        /* La météo du jour : mon humeur + celle de chaque membre, côte à côte. */
        <div className="grid grid-cols-2 gap-3">
          <MoodCard name={t("dashboard.you")} moodId={myMood} onClick={onOpenMood} />
          {partners.map((p) => (
            <MoodCard
              key={p.id}
              name={p.name}
              moodId={p.mood}
              timeLabel={p.timeLabel}
              hidden={p.moodHidden}
            />
          ))}
        </div>
      ) : (
        /* Espace en attente : inviter le/la partenaire */
        <Surface tone="velvet" radius="2xl" className="space-y-v3-3 text-center">
          <p className="font-serif text-lg text-blush-100">
            {t("dashboard.waitingPartnerTitle")}
          </p>
          <p className="text-sm text-taupe-300">
            {t("dashboard.waitingPartnerText")}
          </p>
          {inviteCode ? (
            <>
              <code className="block select-all rounded-2xl bg-charcoal-900/60 px-3 py-2 text-center text-base font-medium tracking-wide text-spice-300">
                {inviteCode}
              </code>
              <p className="text-[11px] text-taupe-400">
                {t("dashboard.inviteHint")}
              </p>
            </>
          ) : (
            onCreateInvite && (
              <Button size="sm" onClick={onCreateInvite}>
                {t("dashboard.createInvite")}
              </Button>
            )
          )}
        </Surface>
      )}

      {shownNotices.length > 0 && (
        <section
          aria-label={t("dashboard.noticesSection")}
          aria-live="polite"
          className="space-y-v3-2"
        >
          {shownNotices.map((n) => {
            const meta = NOTICE_META[n.kind];
            return (
              <Surface
                key={n.id}
                tone="velvet"
                radius="2xl"
                className="flex items-center gap-3 px-3 py-2"
              >
                <span aria-hidden className="text-xl">
                  {meta.icon}
                </span>
                <p className="text-sm text-taupe-200">
                  {t(meta.key as "notice.memberJoined", {
                    name: n.actorName ?? "?",
                  })}
                </p>
              </Surface>
            );
          })}
        </section>
      )}

      {(newPosts > 0 || newComments > 0 || newChallenges > 0) && (
        <section className="space-y-v3-2">
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            {t("dashboard.newHeader")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {newPosts > 0 && (
              <NewsPill onClick={() => onOpen?.("blog")}>
                <span aria-hidden>📖</span>{" "}
                {t("dashboard.newPosts", { count: newPosts })}
              </NewsPill>
            )}
            {newComments > 0 && (
              <NewsPill onClick={() => onOpen?.("blog")}>
                <span aria-hidden>💬</span>{" "}
                {t("dashboard.newComments", { count: newComments })}
              </NewsPill>
            )}
            {newChallenges > 0 && (
              <NewsPill onClick={() => onOpen?.("challenges")}>
                <span aria-hidden>🎲</span>{" "}
                {t("dashboard.newChallenges", { count: newChallenges })}
              </NewsPill>
            )}
          </div>
        </section>
      )}

      {/* Entrée « Menu du soir » (#97b) — rituel quotidien, si activé. Le bouton
          se transforme (braise + badge) quand un match du soir est révélé. */}
      {eveningMenuEnabled && onOpenEveningMenu && partners.length > 0 && (
        <button
          type="button"
          onClick={onOpenEveningMenu}
          className={cn(
            "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-4 text-left shadow-felt transition-all duration-300 ease-felt focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500",
            eveningMenuMatches > 0
              ? "border-bordeaux-600 bg-bordeaux-700 bg-felt-velvet shadow-ember animate-ember-breathe motion-reduce:animate-none"
              : "border-charcoal-600/60 bg-charcoal-800 bg-felt-linen hover:border-spice-400/40",
          )}
        >
          {eveningMenuMatches > 0 && <FireEmbers count={6} />}
          <span aria-hidden className="relative z-10 text-2xl">
            {eveningMenuMatches > 0 ? "✨" : "🍽️"}
          </span>
          <span className="relative z-10 block min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="block font-serif text-base text-blush-100">
                {t("eveningMenu.dashboardEntry")}
              </span>
              {eveningMenuMatches > 0 && (
                <span className="shrink-0 rounded-full border border-spice-400/70 bg-charcoal-900/40 px-2.5 py-1 text-xs text-blush-100">
                  {t("eveningMenu.matchCount", { count: eveningMenuMatches })}
                </span>
              )}
            </span>
            {eveningMenuPreview.every((row) => row.labels.length === 0) ? (
              <span
                className={cn(
                  "block text-xs",
                  eveningMenuMatches > 0 ? "text-blush-200/80" : "text-taupe-300",
                )}
              >
                {t("eveningMenu.dashboardHint")}
              </span>
            ) : (
              <span
                role="list"
                aria-label={t("eveningMenu.previewAria")}
                className={cn(
                  "mt-1.5 block space-y-v3-1.5 text-xs",
                  eveningMenuMatches > 0 ? "text-blush-200/80" : "text-taupe-300",
                )}
              >
                {eveningMenuPreview.map((row) => {
                  const shown =
                    row.labels.length > PREVIEW_MAX
                      ? row.labels.slice(0, PREVIEW_MAX - 1)
                      : row.labels;
                  const more = row.labels.length - shown.length;
                  return (
                    <span
                      key={row.course}
                      role="listitem"
                      className="grid grid-cols-[5rem_1fr] gap-x-2"
                    >
                      <span className="font-medium text-taupe-100">
                        {row.matched && <span aria-hidden>✨ </span>}
                        {t(`eveningMenu.course.${row.course}`)}
                      </span>
                      <span className="min-w-0 leading-snug">
                        {row.labels.length === 0 ? (
                          <span
                            className="text-taupe-400"
                            aria-label={t("eveningMenu.previewEmptyAria")}
                          >
                            —
                          </span>
                        ) : (
                          <>
                            {shown.join(", ")}
                            {more > 0 && ` ${t("eveningMenu.previewMore", { count: more })}`}
                          </>
                        )}
                      </span>
                    </span>
                  );
                })}
              </span>
            )}
          </span>
          <span aria-hidden className="relative z-10 self-center text-taupe-400">
            →
          </span>
        </button>
      )}

      {/* Mur de mots doux (#102) — consultation : on met en valeur les mots reçus,
          l'écriture passe par une feuille. Dès qu'il y a un·e partenaire. */}
      {onComposeLoveNote && partners.length > 0 && (
        <LoveNoteWall
          notes={loveNotes}
          userId={userId}
          onCompose={onComposeLoveNote}
          onDelete={onDeleteLoveNote}
          highlightedNoteId={highlightedLoveNoteId}
        />
      )}
    </div>
  );
}

/** Pastille « Du nouveau » (📖/💬/🎲) — surface chaude avec léger glow. */
function NewsPill({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-spice-500/70 bg-bordeaux-700 px-3 py-1.5 text-sm text-blush-100 shadow-glow transition-transform duration-300 ease-felt hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
    >
      {children}
    </button>
  );
}
