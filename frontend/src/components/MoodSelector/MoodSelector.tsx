import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { MOODS } from "./moods";

export interface MoodSelectorProps {
  /** Mood actuel : id prédéfini OU « emoji [label] » (mood libre). Contrôlé. */
  value?: string | null;
  /** Déclenché au choix d'un mood (prédéfini ou libre). */
  onChange?: (mood: string) => void;
  /** Autoriser une humeur libre (emoji + libellé), sur sa propre ligne. */
  allowCustom?: boolean;
  className?: string;
}

const PREDEFINED = new Set<string>(MOODS.map((m) => m.id));

/** Sépare une humeur libre « emoji label » en { emoji, label }. */
export function parseCustomMood(value: string): { emoji: string; label: string } {
  const i = value.indexOf(" ");
  return i === -1
    ? { emoji: value, label: "" }
    : { emoji: value.slice(0, i), label: value.slice(i + 1) };
}

/**
 * Sélecteur de "Mood" (météo sexuelle) : une rangée d'états d'esprit prédéfinis,
 * plus, sur une ligne dédiée, une humeur libre (emoji + libellé court).
 * L'état actif reçoit un soft glow plutôt qu'une couleur plate (DA "felted").
 */
export function MoodSelector({
  value,
  onChange,
  allowCustom = true,
  className,
}: MoodSelectorProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [emoji, setEmoji] = useState("");
  const [label, setLabel] = useState("");

  // Mood libre actif = une valeur qui n'est pas un id prédéfini.
  const customActive = value != null && !PREDEFINED.has(value);
  const current = customActive ? parseCustomMood(value as string) : null;

  const openEditor = () => {
    setEmoji(current?.emoji ?? "");
    setLabel(current?.label ?? "");
    setAdding(true);
  };

  const submitCustom = () => {
    const e = emoji.trim();
    const l = label.trim();
    const combined = [e, l].filter(Boolean).join(" ");
    setAdding(false);
    setEmoji("");
    setLabel("");
    if (combined) onChange?.(combined);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div role="radiogroup" aria-label={t("moods.aria")} className="flex justify-center gap-2">
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
      </div>

      {/* Ligne dédiée : humeur libre (emoji + libellé). */}
      {allowCustom &&
        (adding ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitCustom();
            }}
          >
            <input
              autoFocus
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={8}
              aria-label={t("moods.addEmojiAria")}
              placeholder={t("moods.addPlaceholder")}
              className="w-14 rounded-2xl border border-spice-400/50 bg-charcoal-800 px-1 py-2 text-center text-xl text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={24}
              aria-label={t("moods.addLabelAria")}
              placeholder={t("moods.labelPlaceholder")}
              className="min-w-0 flex-1 rounded-2xl border border-charcoal-600/60 bg-charcoal-800 px-3 py-2 text-sm text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            />
            <button
              type="submit"
              aria-label={t("common.save")}
              className="rounded-2xl border border-spice-500/70 bg-bordeaux-700 px-3 py-2 text-sm text-blush-100 shadow-glow transition-transform duration-200 ease-felt hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            >
              ✓
            </button>
          </form>
        ) : (
          <button
            type="button"
            role="radio"
            aria-checked={customActive}
            aria-label={
              customActive ? t("moods.customActiveAria") : t("moods.addFree")
            }
            onClick={openEditor}
            className={cn(
              "relative flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2.5",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              customActive
                ? "border-spice-500/70 bg-bordeaux-700 bg-felt-velvet text-blush-100 shadow-glow"
                : "border-dashed border-charcoal-600/60 bg-charcoal-800 text-taupe-300 hover:border-spice-400/50 hover:text-blush-100",
            )}
          >
            {customActive ? (
              <>
                <span className="text-xl">{current?.emoji}</span>
                <span className="text-sm">
                  {current?.label || t("moods.custom")}
                </span>
              </>
            ) : (
              <span className="text-sm">＋ {t("moods.addFree")}</span>
            )}
          </button>
        ))}
    </div>
  );
}
