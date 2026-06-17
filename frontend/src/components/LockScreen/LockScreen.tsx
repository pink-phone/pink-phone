import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export interface LockScreenProps {
  title: string;
  subtitle?: string;
  /** Message d'erreur (ex: code incorrect) — vide la saisie quand il change. */
  error?: string | null;
  /** Nombre de chiffres attendus (auto-soumission une fois atteint). */
  pinLength?: number;
  onSubmit: (pin: string) => void;
  /** Affiche une action « Annuler » (flux des réglages, pas le verrou plein écran). */
  onCancel?: () => void;
  busy?: boolean;
  className?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Saisie de code PIN au pavé numérique (geste tactile, gros boutons feutrés).
 * Présentationnel : la vérification/stockage du code vit ailleurs (lib/pin).
 */
export function LockScreen({
  title,
  subtitle,
  error,
  pinLength = 4,
  onSubmit,
  onCancel,
  busy = false,
  className,
}: LockScreenProps) {
  const { t } = useTranslation();
  const [entry, setEntry] = useState("");

  // Une erreur (code refusé) vide la saisie pour réessayer.
  useEffect(() => {
    if (error) setEntry("");
  }, [error]);

  const append = (d: string) => {
    if (busy || entry.length >= pinLength) return;
    const next = entry + d;
    setEntry(next);
    if (next.length === pinLength) {
      // Laisse le dernier point s'afficher avant de soumettre.
      setTimeout(() => onSubmit(next), 120);
    }
  };

  const back = () => setEntry((e) => e.slice(0, -1));

  return (
    <div className={cn("flex w-full max-w-xs flex-col items-center gap-6", className)}>
      <div className="space-y-1 text-center">
        <span aria-hidden className="text-3xl">
          🔒
        </span>
        <h2 className="font-serif text-2xl text-blush-100">{title}</h2>
        {subtitle && <p className="text-sm text-taupe-300">{subtitle}</p>}
      </div>

      {/* Points de progression */}
      <div className="flex items-center gap-3" aria-hidden>
        {Array.from({ length: pinLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border transition-all duration-300 ease-felt",
              i < entry.length
                ? "border-spice-400 bg-spice-500 shadow-glow"
                : "border-charcoal-600 bg-charcoal-800",
            )}
          />
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-bordeaux-700/40 px-3 py-2 text-center text-xs text-blush-200"
        >
          {error}
        </p>
      )}

      {/* Pavé numérique */}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            onClick={() => append(k)}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-charcoal-600/60 bg-charcoal-800 font-serif text-2xl text-blush-100 shadow-felt-sm transition-all duration-200 ease-felt hover:-translate-y-0.5 hover:border-spice-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500 active:translate-y-0 disabled:opacity-50"
          >
            {k}
          </button>
        ))}
        {/* Annuler (ou case vide) */}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-16 w-16 items-center justify-center rounded-full text-xs text-taupe-400 transition-colors duration-200 ease-felt hover:text-blush-100"
          >
            {t("common.cancel")}
          </button>
        ) : (
          <span className="h-16 w-16" />
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => append("0")}
          className="flex h-16 w-16 items-center justify-center rounded-full border border-charcoal-600/60 bg-charcoal-800 font-serif text-2xl text-blush-100 shadow-felt-sm transition-all duration-200 ease-felt hover:-translate-y-0.5 hover:border-spice-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          disabled={busy || entry.length === 0}
          onClick={back}
          aria-label={t("lock.delete")}
          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl text-taupe-300 transition-colors duration-200 ease-felt hover:text-blush-100 disabled:opacity-30"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
