import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/cn";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-charcoal-900/70 backdrop-blur-sm"
      />
      <div
        className={cn(
          "relative max-h-[90dvh] w-full max-w-md animate-slide-up overflow-y-auto rounded-t-3xl",
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
            aria-label="Fermer"
            className="rounded-full px-2 py-1 text-taupe-400 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
