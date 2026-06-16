import { Button } from "../Button/Button";
import { cn } from "../../lib/cn";

export interface InstallBannerProps {
  /** "android" : prompt natif dispo. "ios" : instructions manuelles. */
  mode: "android" | "ios";
  onInstall?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/** Invite à installer la PWA sur l'écran d'accueil. */
export function InstallBanner({
  mode,
  onInstall,
  onDismiss,
  className,
}: InstallBannerProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 animate-slide-up px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-3xl border border-charcoal-600/60 bg-charcoal-800 bg-felt-velvet px-4 py-3 shadow-felt">
        <span aria-hidden className="text-2xl">
          🕯️
        </span>
        <div className="flex-1 leading-tight">
          <p className="font-serif text-sm text-blush-100">
            Installer Pink Phone
          </p>
          {mode === "android" ? (
            <p className="text-xs text-taupe-400">
              Sur l'écran d'accueil, comme une vraie appli.
            </p>
          ) : (
            <p className="text-xs text-taupe-400">
              Touchez <span aria-hidden>⎋</span> Partager, puis « Sur l'écran
              d'accueil ».
            </p>
          )}
        </div>
        {mode === "android" && (
          <Button size="sm" onClick={onInstall}>
            Installer
          </Button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer"
          className="rounded-full px-2 py-1 text-taupe-400 transition-colors duration-300 ease-felt hover:text-blush-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
