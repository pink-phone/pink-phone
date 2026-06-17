import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { MOODS } from "./moods";

export interface MoodSelectorProps {
  /** Mood actuel : id prédéfini OU emoji libre (mood custom). Contrôlé. */
  value?: string | null;
  /** Déclenché au choix d'un mood (prédéfini ou libre). */
  onChange?: (mood: string) => void;
  /** Autoriser une humeur libre (emoji), via le bouton « + ». */
  allowCustom?: boolean;
  className?: string;
}

const PREDEFINED = new Set<string>(MOODS.map((m) => m.id));

/**
 * Sélecteur de "Mood" (météo sexuelle) : une rangée d'états d'esprit.
 * L'état actif reçoit un soft glow plutôt qu'une couleur plate (DA "felted").
 * Le bouton « + » pose une humeur libre (emoji), façon réaction libre.
 */
export function MoodSelector({
  value,
  onChange,
  allowCustom = true,
  className,
}: MoodSelectorProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");

  // Mood libre actif = une valeur qui n'est pas un id prédéfini (donc un emoji).
  const customActive = value != null && !PREDEFINED.has(value);

  const submitCustom = () => {
    const v = custom.trim();
    setCustom("");
    setAdding(false);
    if (v) onChange?.(v);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("moods.aria")}
      className={cn("flex flex-wrap justify-center gap-2", className)}
    >
      {MOODS.map((mood) => {
        const active = value === mood.id;
        const hot = mood.id === "veryHot";
        return (
          <button
            key={mood.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(`moods.${mood.id}`)}
            onClick={() => onChange?.(mood.id)}
            className={cn(
              "group relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 rounded-2xl border px-1 py-3",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              active
                ? hot
                  ? "border-spice-500/70 bg-bordeaux-700 bg-felt-velvet shadow-ember animate-ember-breathe motion-reduce:animate-none"
                  : "border-spice-500/70 bg-bordeaux-700 bg-felt-velvet shadow-glow"
                : "border-charcoal-600/50 bg-charcoal-800 shadow-felt-sm hover:border-spice-400/50 hover:-translate-y-0.5",
            )}
          >
            {active && hot && <FireEmbers count={5} />}
            <span
              className={cn(
                "relative z-10 text-2xl transition-transform duration-300 ease-felt",
                active ? "scale-110" : "opacity-80 group-hover:opacity-100",
              )}
            >
              {mood.emoji}
            </span>
            <span
              className={cn(
                "relative z-10 text-center text-[11px] leading-tight",
                active ? "text-blush-100" : "text-taupe-300",
              )}
            >
              {t(`moods.${mood.id}`)}
            </span>
          </button>
        );
      })}

      {allowCustom &&
        (adding ? (
          <form
            className="flex flex-none basis-16 items-center justify-center"
            onSubmit={(e) => {
              e.preventDefault();
              submitCustom();
            }}
          >
            <input
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={submitCustom}
              maxLength={16}
              aria-label={t("moods.addAria")}
              placeholder={t("moods.addPlaceholder")}
              className="w-16 rounded-2xl border border-spice-400/50 bg-charcoal-800 px-1 py-3 text-center text-2xl text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            />
          </form>
        ) : (
          <button
            type="button"
            role="radio"
            aria-checked={customActive}
            aria-label={
              customActive ? t("moods.customActiveAria") : t("moods.addAria")
            }
            onClick={() => {
              setCustom(customActive ? (value as string) : "");
              setAdding(true);
            }}
            className={cn(
              "group relative flex min-w-0 flex-none basis-16 flex-col items-center gap-1.5 rounded-2xl border px-1 py-3",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              customActive
                ? "border-spice-500/70 bg-bordeaux-700 bg-felt-velvet shadow-glow"
                : "border-charcoal-600/50 bg-charcoal-800 shadow-felt-sm hover:border-spice-400/50 hover:-translate-y-0.5",
            )}
          >
            <span
              className={cn(
                "relative z-10 text-2xl transition-transform duration-300 ease-felt",
                customActive
                  ? "scale-110"
                  : "text-taupe-300 opacity-80 group-hover:opacity-100",
              )}
            >
              {customActive ? value : "＋"}
            </span>
            <span
              className={cn(
                "relative z-10 text-center text-[11px] leading-tight",
                customActive ? "text-blush-100" : "text-taupe-300",
              )}
            >
              {t("moods.custom")}
            </span>
          </button>
        ))}
    </div>
  );
}
