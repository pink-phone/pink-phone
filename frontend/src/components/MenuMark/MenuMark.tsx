import { cn } from "../../lib/cn";

export type MenuMarkState = "empty" | "mine" | "proposed" | "match" | "refused";

export interface MenuMarkProps {
  state: MenuMarkState;
  className?: string;
}

const STYLE: Record<MenuMarkState, string> = {
  empty: "border-taupe-400/60 text-transparent",
  mine: "border-spice-500 bg-spice-500 text-charcoal-900",
  proposed: "border-2 border-dashed border-spice-400 text-spice-300",
  match: "border-bordeaux-600 bg-bordeaux-700 text-blush-100 shadow-glow",
  refused: "border-charcoal-600 text-taupe-400",
};

const GLYPH: Record<MenuMarkState, string> = {
  empty: "✓",
  mine: "✓",
  proposed: "＋",
  match: "✨",
  refused: "⊘",
};

/**
 * Marque d'état d'un item du menu du soir (#97b, 114c) : remplace le ♥. La
 * forme et le remplissage portent l'état, pas seulement la couleur — coche
 * pleine = choisi par moi, carré pointillé = proposé par l'autre, ✨ = match,
 * ⊘ = refusé, carré vide = non choisi. Décorative (`aria-hidden`) : l'état est
 * aussi dit en texte par l'appelant.
 */
export function MenuMark({ state, className }: MenuMarkProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors duration-300 ease-felt",
        STYLE[state],
        className,
      )}
    >
      {GLYPH[state]}
    </span>
  );
}
