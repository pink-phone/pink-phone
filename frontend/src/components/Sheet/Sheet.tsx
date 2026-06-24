import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Feuille modale qui glisse depuis le bas (pattern PWA). Apparition douce
 * (fade + slide-up), pas de popup agressif. Échap ou clic sur le voile ferme.
 */
export function Sheet({ open, title, onClose, children, className }: SheetProps) {
  const { t } = useTranslation();
  // `onClose` est souvent une lambda inline (recréée à chaque rendu du parent) :
  // on la lit via une ref pour ne pas réabonner le listener Échap à chaque rendu
  // (REACT-02). L'effet ne dépend donc que de `open`.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);
  // Élément focalisé avant l'ouverture, pour lui rendre le focus à la fermeture.
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Gestion du focus (UI2-01) : on mémorise le focus courant, on entre dans le
    // panneau (pas le voile), et on le restitue à la fermeture.
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Piège à focus (UI2-01) : Tab/Shift+Tab bouclent dans le panneau.
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Voile : non focusable (UI2-01) — il ne doit pas être la 1ʳᵉ cible Tab
          (Entrée fermerait la feuille). La fermeture passe par ✕ / Échap / clic. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in motion-reduce:animate-none bg-charcoal-900/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        className={cn(
          "relative max-h-[90dvh] w-full max-w-md animate-slide-up motion-reduce:animate-none overflow-y-auto rounded-t-3xl outline-none",
          "border-x border-t border-charcoal-600/60 bg-charcoal-800 bg-felt-velvet shadow-felt",
          "px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3",
          className,
        )}
      >
        {/* Poignée + en-tête */}
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-charcoal-600" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl text-blush-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
