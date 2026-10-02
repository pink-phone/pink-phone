import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

export interface UndoToastProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  /** Auto-fermeture (ms) ; mise en pause au survol/focus (WCAG 2.2.1). */
  duration?: number;
  className?: string;
}

/**
 * Toast éphémère avec action « Annuler » (filet de sécurité d'une action
 * destructive légère). Ancré en bas, sous les pouces, au-dessus du safe-area.
 * Le minuteur s'arrête tant que le toast est survolé ou a le focus.
 */
export function UndoToast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 8000,
  className,
}: UndoToastProps) {
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!duration || paused) return;
    const id = setTimeout(() => dismissRef.current(), duration);
    return () => clearTimeout(id);
  }, [duration, paused]);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-charcoal-600 bg-charcoal-800 bg-felt-linen py-1 pl-4 pr-1 text-sm text-taupe-100 shadow-felt animate-fade-in motion-reduce:animate-none",
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <button
        type="button"
        onClick={onAction}
        className="min-h-11 shrink-0 rounded-xl px-4 font-medium text-spice-300 transition-colors duration-300 ease-felt hover:text-blush-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
      >
        {actionLabel}
      </button>
    </div>
  );
}
