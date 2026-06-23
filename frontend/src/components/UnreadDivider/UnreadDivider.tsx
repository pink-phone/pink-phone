import { cn } from "../../lib/cn";

export interface UnreadDividerProps {
  /** Libellé centré (ex. « Non lus »). */
  label: string;
  className?: string;
}

/**
 * Séparateur « non lus » façon barre « nouveaux messages » : un trait feutré
 * dégradé en braise (spice) avec une étiquette centrée, inséré dans un fil pour
 * marquer la frontière entre le contenu nouveau (au-dessus) et déjà vu (dessous).
 */
export function UnreadDivider({ label, className }: UnreadDividerProps) {
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
