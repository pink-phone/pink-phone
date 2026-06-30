import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn";

export interface ToastProps {
  message: string;
  /** Émoji/icône optionnel devant le message. */
  icon?: string;
  /** Auto-fermeture après ce délai (ms). 0 ⇒ pas d'auto-fermeture. */
  duration?: number;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Petite notification éphémère, non bloquante, ancrée en haut de l'écran
 * (au-dessus du contenu, sous le safe-area). S'auto-ferme. `role=status` +
 * `aria-live=polite` pour les lecteurs d'écran ; respecte `prefers-reduced-motion`.
 */
export function Toast({
  message,
  icon,
  duration = 3000,
  onDismiss,
  className,
}: ToastProps) {
  // `onDismiss` est souvent une lambda recréée à chaque rendu du parent : on la
  // lit via une ref pour ne pas relancer le minuteur à chaque rendu.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!duration) return;
    const id = setTimeout(() => onDismissRef.current?.(), duration);
    return () => clearTimeout(id);
  }, [duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 -translate-x-1/2",
        "animate-fade-in motion-reduce:animate-none",
        "flex items-center gap-2 rounded-full border border-spice-500/70 bg-bordeaux-700 px-4 py-2 text-sm text-blush-100 shadow-glow",
        className,
      )}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <button
        type="button"
        onClick={() => onDismissRef.current?.()}
        className="text-left focus-visible:outline-none"
      >
        {message}
      </button>
    </div>
  );
}
