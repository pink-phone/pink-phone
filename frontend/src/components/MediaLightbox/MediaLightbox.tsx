import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SafeMedia } from "../SafeMedia/SafeMedia";
import type { BlogPostMedia } from "../BlogPost/BlogPost";
import { cn } from "../../lib/cn";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface MediaLightboxProps {
  open: boolean;
  /** Médias du post, dans l'ordre (mêmes objets que `MediaGallery`). */
  media: BlogPostMedia[];
  /** Index du média affiché. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Visionnage plein écran d'un média de post. L'ouverture (bouton « agrandir »
 * de `SafeMedia`) ne révèle rien : le flou et le geste hold-to-reveal restent
 * intacts, simplement rejoués en grand — la révélation ne devient jamais un
 * toggle. Navigation entre médias via des boutons prev/next distincts du
 * média (pas de swipe superposé dessus : un geste de navigation démarré sur
 * `SafeMedia` armerait sa révélation dès `onPointerDown`).
 */
export function MediaLightbox({
  open,
  media,
  index,
  onIndexChange,
  onClose,
  className,
}: MediaLightboxProps) {
  const { t } = useTranslation();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Lu par le handler Échap/flèches (abonné une seule fois par ouverture,
  // cf. REACT-02 dans Sheet) : toujours à jour sans réabonner à chaque rendu.
  const navRef = useRef({ index, length: media.length, onIndexChange });
  navRef.current = { index, length: media.length, onIndexChange };
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const { index: i, length, onIndexChange: setIndex } = navRef.current;
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "ArrowRight" && i < length - 1) setIndex(i + 1);
      else if (e.key === "ArrowLeft" && i > 0) setIndex(i - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const list = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  const current = media[index];
  if (!current) return null;

  // Portail vers document.body (même pattern que ContextMenu) : un `fixed`
  // rendu au fil de l'arbre peut se retrouver contenu par un ancêtre
  // transformé (animations de page/écran) et ne plus couvrir tout le
  // viewport — le portail garantit un plein écran réel.
  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t("mediaLightbox.title")}
      className={cn(
        "fixed inset-0 z-[70] flex flex-col bg-charcoal-900/95 outline-hidden",
        "animate-fade-in motion-reduce:animate-none",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <span className="text-xs text-taupe-300">
          {media.length > 1
            ? t("mediaLightbox.counter", { current: index + 1, total: media.length })
            : null}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-taupe-200 transition-colors duration-300 ease-felt hover:text-blush-100"
        >
          ✕
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SafeMedia
          // Nouvelle instance à chaque média : repart flouté, chargement propre.
          key={index}
          src={current.src}
          loader={current.loader}
          kind={current.kind}
          alt={current.alt}
          downloadable={current.downloadable}
          width={current.width}
          height={current.height}
          fullscreen
        />

        {index > 0 && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            aria-label={t("mediaLightbox.previous")}
            className="absolute left-1 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-charcoal-900/70 text-lg leading-none text-blush-100 shadow-felt-sm backdrop-blur-xs transition-colors duration-200 ease-felt hover:bg-charcoal-900/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
          >
            <span aria-hidden>‹</span>
          </button>
        )}
        {index < media.length - 1 && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            aria-label={t("mediaLightbox.next")}
            className="absolute right-1 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-charcoal-900/70 text-lg leading-none text-blush-100 shadow-felt-sm backdrop-blur-xs transition-colors duration-200 ease-felt hover:bg-charcoal-900/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
          >
            <span aria-hidden>›</span>
          </button>
        )}
      </div>

      {media.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-3" aria-hidden>
          {media.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300 ease-felt",
                i === index ? "w-4 bg-spice-400" : "w-1.5 bg-charcoal-600",
              )}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
