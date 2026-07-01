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

const RADII = {
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
} as const;

export interface SurfaceProps {
  children: ReactNode;
  /** Teinte feutrée de la surface. */
  tone?: SurfaceTone;
  /** Arrondi des coins (défaut `3xl`). `2xl` = un peu moins bombé. */
  radius?: keyof typeof RADII;
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
  radius = "3xl",
  as: Tag = "div",
  className,
}: SurfaceProps) {
  return (
    <Tag
      className={cn(
        "border p-5 shadow-felt",
        RADII[radius],
        TONES[tone],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
