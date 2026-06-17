import type { ElementType, ReactNode } from "react";
import { cn } from "../../lib/cn";

type SurfaceTone = "velvet" | "blush" | "deep";

const TONES: Record<SurfaceTone, string> = {
  // Velours sombre — surface par défaut sur fond charbon
  velvet: "bg-charcoal-800 bg-felt-linen text-taupe-200 border-charcoal-600/60",
  // Carte claire (Blush Privé) — pour mettre en valeur un contenu doux
  blush: "bg-blush-50 bg-felt-linen text-bordeaux-700 border-blush-200",
  // Bordeaux profond — états "chauds" / mises en avant
  deep: "bg-bordeaux-700 bg-felt-velvet text-blush-100 border-bordeaux-600",
};

export interface SurfaceProps {
  children: ReactNode;
  /** Teinte feutrée de la surface. */
  tone?: SurfaceTone;
  /** Élément HTML rendu (div par défaut). */
  as?: ElementType;
  className?: string;
}

/**
 * Conteneur "feutré" de base : coins très arrondis, texture subtile,
 * ombre douce. Toutes les cartes de l'app héritent de cette surface.
 */
export function Surface({
  children,
  tone = "velvet",
  as: Tag = "div",
  className,
}: SurfaceProps) {
  return (
    <Tag
      className={cn(
        "rounded-3xl border p-5 shadow-felt",
        TONES[tone],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
