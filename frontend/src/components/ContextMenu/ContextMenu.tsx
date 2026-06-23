import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  /** Action destructive (rendu rouge). */
  danger?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  /** Libellé accessible du déclencheur « ⋯ ». */
  ariaLabel: string;
  className?: string;
}

interface Anchor {
  /** Bord droit du déclencheur (le menu est aligné à droite). */
  right: number;
  /** Y où ancrer le menu (bas du déclencheur, ou haut si on ouvre vers le haut). */
  y: number;
  openUp: boolean;
}

/**
 * Menu contextuel « ⋯ » : déclencheur + liste d'actions (modifier, supprimer…).
 *
 * Le menu déroulant est rendu dans un **portal** (`position: fixed`) ancré au
 * déclencheur : il échappe ainsi à l'`overflow-hidden` et aux contextes
 * d'empilement des cartes parentes (ex. carte défi « hot » avec halo de braise),
 * sinon un menu s'ouvrant vers le haut sur la dernière tuile était rogné/masqué.
 */
export function ContextMenu({ items, ariaLabel, className }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Ouvre vers le HAUT si le déclencheur est dans le bas de l'écran (sinon le
    // menu sortait sous le bord, ex. dernière tuile).
    const openUp = rect.bottom > window.innerHeight * 0.6;
    setAnchor({
      right: rect.right,
      y: openUp ? rect.top : rect.bottom,
      openUp,
    });
  };

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) place();
      return next;
    });
  };

  // Échap referme (cohérent avec Sheet, UI-A11Y4). Un scroll/redimensionnement
  // referme aussi (le menu en position fixe se détacherait sinon).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded-full px-2 py-1 text-base leading-none text-taupe-400 transition-colors duration-300 ease-felt hover:text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
      >
        ⋯
      </button>

      {open &&
        anchor &&
        createPortal(
          <>
            {/* Voile invisible : un clic dehors referme. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default"
            />
            <div
              role="menu"
              style={{
                position: "fixed",
                left: anchor.right,
                top: anchor.openUp ? anchor.y - 4 : anchor.y + 4,
                transform: anchor.openUp
                  ? "translate(-100%, -100%)"
                  : "translateX(-100%)",
              }}
              className="z-[61] min-w-36 overflow-hidden rounded-2xl border border-charcoal-600/60 bg-charcoal-800 bg-felt-velvet py-1 shadow-felt"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={cn(
                    "block w-full px-4 py-2 text-left text-sm transition-colors duration-200 ease-felt",
                    item.danger
                      ? "text-spice-300 hover:bg-bordeaux-700/30"
                      : "text-taupe-200 hover:bg-charcoal-700",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
