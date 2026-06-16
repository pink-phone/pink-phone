import { Surface } from "../../components/Surface/Surface";
import { MoodSelector } from "../../components/MoodSelector/MoodSelector";
import {
  MOODS,
  type MoodId,
  type MoodOption,
} from "../../components/MoodSelector/moods";
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
  return (
    <Surface
      tone={mood ? "deep" : "velvet"}
      className="flex flex-col items-center gap-1 text-center"
    >
      <span aria-hidden className="text-4xl">
        {mood ? mood.emoji : "…"}
      </span>
      <p className="font-serif text-base text-blush-100">{name}</p>
      {mood ? (
        <>
          <p className="text-sm text-blush-200">{mood.label}</p>
          {timeLabel && (
            <p className="text-xs text-blush-200/70">Mis à jour {timeLabel}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-taupe-300">Pas encore d'humeur aujourd'hui.</p>
      )}
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
}: DashboardScreenProps) {
  const myM = myMood ? moodOf(myMood) : null;
  const partnerM = partnerMood ? moodOf(partnerMood.mood) : null;

  return (
    <div className="space-y-6">
      <header className="relative pt-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-taupe-400">
          Aujourd'hui
        </p>
        <h1 className="mt-1 font-serif text-3xl text-blush-100">{spaceName}</h1>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Réglages"
            className="absolute right-0 top-1 rounded-full px-2 py-1 text-xl text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300"
          >
            ⚙️
          </button>
        )}
      </header>

      {partner ? (
        /* La météo du jour : les deux humeurs côte à côte, la perche sans un mot. */
        <div className="grid grid-cols-2 gap-3">
          <MoodCard name="Toi" mood={myM} />
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
            En attente de votre partenaire
          </p>
          <p className="text-sm text-taupe-300">
            Partagez-lui l'identifiant de l'espace pour qu'il/elle vous rejoigne.
          </p>
          {inviteId && (
            <code className="block select-all break-all rounded-2xl bg-charcoal-900/60 px-3 py-2 text-xs text-spice-300">
              {inviteId}
            </code>
          )}
        </Surface>
      )}

      {/* Mon humeur du jour */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg text-taupe-100">
          Comment te sens-tu&nbsp;?
        </h2>
        <MoodSelector value={myMood} onChange={onMoodChange} />
        {myMood ? (
          <p className="text-center text-xs text-taupe-400">
            {partner
              ? `Ton humeur est partagée avec ${partner.name}.`
              : "Ton humeur est enregistrée."}{" "}
            Elle se renouvelle chaque jour.
          </p>
        ) : (
          <p className="text-center text-xs text-taupe-400">
            Choisis ton humeur du jour pour lui faire signe.
          </p>
        )}
      </section>
    </div>
  );
}
