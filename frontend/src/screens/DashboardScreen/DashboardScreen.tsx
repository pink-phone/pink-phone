import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { MoodSelector } from "../../components/MoodSelector/MoodSelector";
import { FireEmbers } from "../../components/FireEmbers/FireEmbers";
import {
  MOODS,
  type MoodId,
  type MoodOption,
} from "../../components/MoodSelector/moods";
import { cn } from "../../lib/cn";
import type { MoodSnapshot, Person } from "../../mock/data";

export interface DashboardScreenProps {
  spaceName: string;
  /** Absent tant que le/la partenaire n'a pas rejoint l'espace. */
  partner?: Person;
  partnerMood?: MoodSnapshot;
  /** Id de l'espace, à partager pour inviter (affiché si pas de partenaire). */
  inviteId?: string;
  myMood: MoodId | null;
  onMoodChange: (mood: MoodId) => void;
  onOpenSettings?: () => void;
  /** Nouveautés non vues (badges "Du nouveau"). */
  newPosts?: number;
  newChallenges?: number;
  /** Ouvre un fil depuis le dashboard (au clic sur une pastille de nouveauté). */
  onOpen?: (tab: "blog" | "challenges") => void;
}

const moodOf = (id: MoodId) => MOODS.find((m) => m.id === id)!;

/** Une "vignette météo" pour l'humeur d'une personne (ou son absence). */
function MoodCard({
  name,
  mood,
  timeLabel,
}: {
  name: string;
  mood: MoodOption | null;
  timeLabel?: string;
}) {
  const { t } = useTranslation();
  const hot = mood?.id === "veryHot";
  return (
    <Surface
      tone={mood ? "deep" : "velvet"}
      className={cn(
        "relative overflow-hidden",
        hot && "shadow-ember animate-ember-breathe motion-reduce:animate-none",
      )}
    >
      {hot && <FireEmbers count={6} />}
      <div className="relative z-10 flex flex-col items-center gap-1 text-center">
        <span aria-hidden className="text-4xl">
          {mood ? mood.emoji : "…"}
        </span>
        <p className="font-serif text-base text-blush-100">{name}</p>
        {mood ? (
          <>
            <p className="text-sm text-blush-200">{t(`moods.${mood.id}`)}</p>
            {timeLabel && (
              <p className="text-xs text-blush-200/70">
                {t("dashboard.updatedAt", { time: timeLabel })}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-taupe-300">{t("dashboard.noMoodYet")}</p>
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
  inviteId,
  myMood,
  onMoodChange,
  onOpenSettings,
  newPosts = 0,
  newChallenges = 0,
  onOpen,
}: DashboardScreenProps) {
  const { t } = useTranslation();
  const myM = myMood ? moodOf(myMood) : null;
  const partnerM = partnerMood ? moodOf(partnerMood.mood) : null;

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
          <MoodCard name={t("dashboard.you")} mood={myM} />
          <MoodCard
            name={partner.name}
            mood={partnerM}
            timeLabel={partnerMood?.timeLabel}
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

      {(newPosts > 0 || newChallenges > 0) && (
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
        <MoodSelector value={myMood} onChange={onMoodChange} />
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
