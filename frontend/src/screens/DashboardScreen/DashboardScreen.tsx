import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { MoodSelector } from "../../components/MoodSelector/MoodSelector";
import { FireEmbers } from "../../components/FireEmbers/FireEmbers";
import { MOODS } from "../../components/MoodSelector/moods";
import { parseCustomMood } from "../../components/MoodSelector/MoodSelector";
import { cn } from "../../lib/cn";
import type { MoodSnapshot, Person } from "../../mock/data";

export interface DashboardScreenProps {
  spaceName: string;
  /** Absent tant que le/la partenaire n'a pas rejoint l'espace. */
  partner?: Person;
  partnerMood?: MoodSnapshot;
  /** Vote à l'aveugle actif ET je n'ai pas encore posé mon humeur → masque celle du partenaire. */
  partnerMoodHidden?: boolean;
  /** Id de l'espace, à partager pour inviter (affiché si pas de partenaire). */
  inviteId?: string;
  /** Mood courant : id prédéfini OU emoji libre (mood custom). */
  myMood: string | null;
  onMoodChange: (mood: string) => void;
  /** Retire mon humeur du jour (désélection). */
  onMoodClear?: () => void;
  onOpenSettings?: () => void;
  /** Nouveautés non vues (badges "Du nouveau"). */
  newPosts?: number;
  /** Posts ayant reçu un nouveau commentaire de l'autre. */
  newComments?: number;
  newChallenges?: number;
  /** Ouvre un fil depuis le dashboard (au clic sur une pastille de nouveauté). */
  onOpen?: (tab: "blog" | "challenges") => void;
}

/** Une "vignette météo" pour l'humeur d'une personne (ou son absence). */
function MoodCard({
  name,
  moodId,
  timeLabel,
  hidden = false,
}: {
  name: string;
  /** Id prédéfini, emoji libre, ou null (pas encore d'humeur). */
  moodId: string | null;
  timeLabel?: string;
  /** Vote à l'aveugle : humeur masquée tant que je n'ai pas posé la mienne. */
  hidden?: boolean;
}) {
  const { t } = useTranslation();
  const predef = moodId ? MOODS.find((m) => m.id === moodId) : undefined;
  const isCustom = !!moodId && !predef;
  const custom = isCustom ? parseCustomMood(moodId as string) : null;
  const hot = !hidden && predef?.id === "veryHot";
  const has = !hidden && !!moodId;
  return (
    <Surface
      tone={has ? "deep" : "velvet"}
      className={cn(
        "relative overflow-hidden",
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
              <p className="text-xs text-taupe-300">{t("dashboard.noMoodYet")}</p>
            )}
          </>
        )}
      </div>
    </Surface>
  );
}

/** Accueil du Space : la météo sexuelle d'un coup d'œil. */
export function DashboardScreen({
  spaceName,
  partner,
  partnerMood,
  partnerMoodHidden = false,
  inviteId,
  myMood,
  onMoodChange,
  onMoodClear,
  onOpenSettings,
  newPosts = 0,
  newComments = 0,
  newChallenges = 0,
  onOpen,
}: DashboardScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <header className="relative pt-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-taupe-400">
          {t("dashboard.today")}
        </p>
        <h1 className="mt-1 font-serif text-3xl text-blush-100">{spaceName}</h1>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t("dashboard.settings")}
            className="absolute right-0 top-1 rounded-full px-2 py-1 text-xl text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300"
          >
            ⚙️
          </button>
        )}
      </header>

      {partner ? (
        /* La météo du jour : les deux humeurs côte à côte, la perche sans un mot. */
        <div className="grid grid-cols-2 gap-3">
          <MoodCard name={t("dashboard.you")} moodId={myMood} />
          <MoodCard
            name={partner.name}
            moodId={partnerMood?.mood ?? null}
            timeLabel={partnerMood?.timeLabel}
            hidden={partnerMoodHidden}
          />
        </div>
      ) : (
        /* Espace en attente : inviter le/la partenaire */
        <Surface tone="velvet" className="space-y-2 text-center">
          <p className="font-serif text-lg text-blush-100">
            {t("dashboard.waitingPartnerTitle")}
          </p>
          <p className="text-sm text-taupe-300">
            {t("dashboard.waitingPartnerText")}
          </p>
          {inviteId && (
            <code className="block select-all break-all rounded-2xl bg-charcoal-900/60 px-3 py-2 text-xs text-spice-300">
              {inviteId}
            </code>
          )}
        </Surface>
      )}

      {(newPosts > 0 || newComments > 0 || newChallenges > 0) && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            {t("dashboard.newHeader")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {newPosts > 0 && (
              <button
                type="button"
                onClick={() => onOpen?.("blog")}
                className="inline-flex items-center gap-1.5 rounded-full border border-spice-500/70 bg-bordeaux-700 px-3 py-1.5 text-sm text-blush-100 shadow-glow transition-transform duration-300 ease-felt hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                📖 {t("dashboard.newPosts", { count: newPosts })}
              </button>
            )}
            {newComments > 0 && (
              <button
                type="button"
                onClick={() => onOpen?.("blog")}
                className="inline-flex items-center gap-1.5 rounded-full border border-spice-500/70 bg-bordeaux-700 px-3 py-1.5 text-sm text-blush-100 shadow-glow transition-transform duration-300 ease-felt hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                💬 {t("dashboard.newComments", { count: newComments })}
              </button>
            )}
            {newChallenges > 0 && (
              <button
                type="button"
                onClick={() => onOpen?.("challenges")}
                className="inline-flex items-center gap-1.5 rounded-full border border-spice-500/70 bg-bordeaux-700 px-3 py-1.5 text-sm text-blush-100 shadow-glow transition-transform duration-300 ease-felt hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                🎲 {t("dashboard.newChallenges", { count: newChallenges })}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Mon humeur du jour */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg text-taupe-100">
          {t("dashboard.moodQuestion")}
        </h2>
        <MoodSelector
          value={myMood}
          onChange={onMoodChange}
          onClear={onMoodClear}
        />
        {myMood ? (
          <p className="text-center text-xs text-taupe-400">
            {partner
              ? t("dashboard.moodSharedWith", { name: partner.name })
              : t("dashboard.moodSaved")}{" "}
            {t("dashboard.moodRenews")}
          </p>
        ) : (
          <p className="text-center text-xs text-taupe-400">
            {t("dashboard.moodPrompt")}
          </p>
        )}
      </section>
    </div>
  );
}
