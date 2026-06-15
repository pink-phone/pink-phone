import { Surface } from "../../components/Surface/Surface";
import { Button } from "../../components/Button/Button";
import { Toggle } from "../../components/form/Toggle";
import { cn } from "../../lib/cn";
import type { NotifMode } from "../../api/types";

interface ModeOption {
  id: NotifMode;
  emoji: string;
  title: string;
  description: string;
  soon?: boolean;
}

const MODES: ModeOption[] = [
  {
    id: "push",
    emoji: "🔔",
    title: "Notifications immédiates",
    description: "Une alerte discrète dès qu'il/elle publie.",
  },
  {
    id: "digest",
    emoji: "📬",
    title: "Résumé quotidien",
    description: "Un seul mail par jour, sans interruption.",
    soon: true,
  },
  {
    id: "ghost",
    emoji: "🌙",
    title: "Mode fantôme",
    description: "Aucune notification, on découvre en ouvrant l'app.",
  },
];

export interface SettingsScreenProps {
  notifMode: NotifMode;
  onModeChange: (mode: NotifMode) => void;
  /** Le push est-il supporté par l'appareil ? */
  pushSupported?: boolean;
  /** Message d'erreur (ex: permission refusée). */
  pushError?: string | null;
  busy?: boolean;
  /** Effet « braise » des états chauds (halo + particules). */
  hotAnimEnabled?: boolean;
  onHotAnimChange?: (enabled: boolean) => void;
  onBack?: () => void;
  onLogout?: () => void;
}

/** Réglages : mode de notification « à la carte » + apparence + déconnexion. */
export function SettingsScreen({
  notifMode,
  onModeChange,
  pushSupported = true,
  pushError,
  busy,
  hotAnimEnabled = true,
  onHotAnimChange,
  onBack,
  onLogout,
}: SettingsScreenProps) {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="rounded-full px-2 py-1 text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ←
          </button>
        )}
        <h1 className="font-serif text-2xl text-blush-100">Réglages</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          Notifications
        </h2>

        {!pushSupported && (
          <p className="text-xs text-taupe-400">
            Le push n'est pas disponible sur cet appareil — le résumé ou le mode
            fantôme restent possibles.
          </p>
        )}

        <div
          role="radiogroup"
          aria-label="Mode de notification"
          className="space-y-2"
        >
          {MODES.map((mode) => {
            const active = notifMode === mode.id;
            const disabled = busy || (mode.id === "push" && !pushSupported);
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onModeChange(mode.id)}
                className="block w-full text-left disabled:opacity-50"
              >
                <Surface
                  tone={active ? "deep" : "velvet"}
                  className={cn(
                    "flex items-start gap-3 transition-all duration-300 ease-felt",
                    active ? "shadow-glow" : "hover:-translate-y-0.5",
                  )}
                >
                  <span aria-hidden className="text-2xl">
                    {mode.emoji}
                  </span>
                  <span className="leading-tight">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-serif text-base",
                          active ? "text-blush-100" : "text-taupe-100",
                        )}
                      >
                        {mode.title}
                      </span>
                      {mode.soon && (
                        <span className="rounded-full bg-charcoal-700 px-2 py-0.5 text-[10px] text-taupe-300">
                          bientôt
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-xs",
                        active ? "text-blush-200" : "text-taupe-400",
                      )}
                    >
                      {mode.description}
                    </span>
                  </span>
                </Surface>
              </button>
            );
          })}
        </div>

        {pushError && (
          <p className="rounded-2xl bg-bordeaux-700/40 px-3 py-2 text-xs text-blush-200">
            {pushError}
          </p>
        )}
      </section>

      {onHotAnimChange && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            Apparence
          </h2>
          <Surface tone="velvet">
            <Toggle
              checked={hotAnimEnabled}
              onChange={onHotAnimChange}
              label="Effet braise 🔥"
              hint="Halo et particules animés sur les états chauds. Désactive pour un rendu calme."
            />
          </Surface>
        </section>
      )}

      {onLogout && (
        <section className="pt-2">
          <Button variant="secondary" className="w-full" onClick={onLogout}>
            Se déconnecter
          </Button>
        </section>
      )}
    </div>
  );
}
