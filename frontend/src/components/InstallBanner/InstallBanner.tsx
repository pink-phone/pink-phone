import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        // Posé AU-DESSUS de la BottomNav (≈ 3,5rem + safe-area) pour ne pas
        // masquer les onglets (UI-UX1). La nav gère déjà la safe-area iOS.
        "fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 animate-slide-up motion-reduce:animate-none px-3 pb-2",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-3xl border border-charcoal-600/60 bg-charcoal-800 bg-felt-velvet px-4 py-3 shadow-felt">
        <span aria-hidden className="text-2xl">
          🕯️
        </span>
        <div className="flex-1 leading-tight">
          <p className="font-serif text-sm text-blush-100">
            {t("install.title")}
          </p>
          <p className="text-xs text-taupe-300">
            {mode === "android" ? t("install.android") : t("install.ios")}
          </p>
        </div>
        {mode === "android" && (
          <Button size="sm" onClick={onInstall}>
            {t("install.install")}
          </Button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("common.close")}
          className="rounded-full px-2 py-1 text-taupe-400 transition-colors duration-300 ease-felt hover:text-blush-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
