import { cn } from "../../lib/cn";

export interface FireEmbersProps {
  /** Nombre de particules (densité du feu). 6 par défaut. */
  count?: number;
  className?: string;
}

// Positions horizontales déterministes (%) pour un rendu stable et "vivant".
const SEED = [10, 26, 43, 58, 72, 86, 34, 64, 18, 50];

/**
 * Pluie de braises montantes — overlay décoratif des états "hot" (DA "felted").
 * À poser dans un conteneur `relative` ; les particules sont clippées à ses
 * coins arrondis. Purement présentationnel (aria-hidden) et désactivé sous
 * `prefers-reduced-motion`. Se combine avec un halo `shadow-ember`/
 * `animate-ember-breathe` sur le conteneur.
 */
export function FireEmbers({ count = 6, className }: FireEmbersProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]",
        "motion-reduce:hidden",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => {
        const left = SEED[i % SEED.length];
        const delay = (i * 0.43) % 2.4;
        const duration = 2.2 + ((i * 7) % 12) / 10; // 2.2 → 3.3 s
        const size = 3 + (i % 3); // 3 → 5 px
        return (
          <span
            key={i}
            className="absolute bottom-0 animate-ember-rise rounded-full blur-[0.5px]"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              background:
                "radial-gradient(circle at 50% 35%, #F6D9A0, #E8975A 55%, rgba(184,92,114,0))",
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </span>
  );
}
