import { useTranslation } from "react-i18next";
import { Toggle } from "../form/Toggle";
import { REACTIONS, type ReactionId } from "../ReactionBar/ReactionBar";

const EMOJI: Record<ReactionId, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.id, r.emoji]),
) as Record<ReactionId, string>;
const ALL_IDS = REACTIONS.map((r) => r.id);

export interface ReactionSettingsProps {
  /** Réactions actives, dans l'ordre. */
  value: ReactionId[];
  allowCustom: boolean;
  onChange: (reactions: ReactionId[], allowCustom: boolean) => void;
}

/** Réglage des réactions du salon : activer/ordonner + autoriser les emoji libres. */
export function ReactionSettings({
  value,
  allowCustom,
  onChange,
}: ReactionSettingsProps) {
  const { t } = useTranslation();
  const disabled = ALL_IDS.filter((id) => !value.includes(id));

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next, allowCustom);
  };
  const remove = (id: ReactionId) =>
    onChange(value.filter((x) => x !== id), allowCustom);
  const add = (id: ReactionId) => onChange([...value, id], allowCustom);

  return (
    <div className="space-y-3">
      <p className="text-xs text-taupe-400">{t("settings.reactionsIntro")}</p>

      {/* Réactions actives, ordonnables */}
      <ul className="space-y-1.5">
        {value.map((id, i) => (
          <li
            key={id}
            className="flex items-center gap-2 rounded-2xl bg-charcoal-900/40 px-3 py-1.5"
          >
            <span className="text-base leading-none">{EMOJI[id]}</span>
            <span className="flex-1 text-sm text-taupe-200">
              {t(`reactions.${id}`)}
            </span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="↑"
              className="rounded-full px-1.5 text-taupe-400 transition-colors duration-300 ease-felt hover:text-blush-100 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === value.length - 1}
              aria-label="↓"
              className="rounded-full px-1.5 text-taupe-400 transition-colors duration-300 ease-felt hover:text-blush-100 disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(id)}
              aria-label={t("settings.reactionDisable")}
              className="rounded-full px-1.5 text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* Réactions désactivées, à réactiver */}
      {disabled.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {disabled.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => add(id)}
              aria-label={t("settings.reactionEnable")}
              className="inline-flex items-center gap-1.5 rounded-full border border-charcoal-600/60 bg-charcoal-800 px-3 py-1 text-sm text-taupe-300 transition-all duration-300 ease-felt hover:border-spice-400/40 hover:text-blush-100"
            >
              <span className="text-base leading-none">{EMOJI[id]}</span>
              <span className="text-xs">＋</span>
            </button>
          ))}
        </div>
      )}

      <Toggle
        checked={allowCustom}
        onChange={(v) => onChange(value, v)}
        label={t("settings.allowCustom")}
        hint={t("settings.allowCustomHint")}
      />
    </div>
  );
}
