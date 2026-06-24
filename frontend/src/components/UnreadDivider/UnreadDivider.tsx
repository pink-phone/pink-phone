import { cn } from "../../lib/cn";

export interface UnreadDividerProps {
  /** Libellé centré (ex. « Non lus », « Déjà lu »). */
  label: string;
  /**
   * `unread` (défaut) — tête du bloc non lu, ton braise (spice) : « nouveautés ici ».
   * `alreadyRead`     — pied du bloc non lu, ton neutre (taupe) : « plus ancien en dessous ».
   */
  variant?: "unread" | "alreadyRead";
  className?: string;
}

/**
 * Séparateur de lecture pour les fils anté-chronologiques (non lus en haut).
 *
 * Deux variantes forment un sandwich visuel :
 *   ── Non lus ──     ← `unread`      — au-dessus du bloc nouvelles entrées (spice)
 *   [contenus non lus]
 *   ── Déjà lu ──     ← `alreadyRead` — en-dessous du bloc, avant le déjà-vu (taupe)
 *   [contenus vus]
 *
 * La variante `alreadyRead` n'est rendue que s'il existe du contenu après le bloc
 * non lu ; la variante `unread` s'affiche dès qu'il y a au moins un item non lu.
 */
export function UnreadDivider({
  label,
  variant = "unread",
  className,
}: UnreadDividerProps) {
  if (variant === "alreadyRead") {
    return (
      <div
        role="separator"
        aria-label={label}
        className={cn("flex items-center gap-3 py-1", className)}
      >
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-taupe-400/25" />
        <span className="rounded-full bg-charcoal-700/50 px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-taupe-400/60">
          {label}
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-taupe-400/25" />
      </div>
    );
  }

  return (
    <div
      role="separator"
      aria-label={label}
      className={cn("flex items-center gap-3 py-1", className)}
    >
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-spice-400/50" />
      <span className="rounded-full bg-spice-500/15 px-3 py-0.5 text-[11px] font-medium uppercase tracking-[0.15em] text-spice-300">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-spice-400/50" />
    </div>
  );
}
