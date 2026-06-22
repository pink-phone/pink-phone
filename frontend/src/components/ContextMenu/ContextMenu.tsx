import { useState } from "react";
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

/** Menu contextuel « ⋯ » : déclencheur + liste d'actions (modifier, supprimer…). */
export function ContextMenu({ items, ariaLabel, className }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full px-2 py-1 text-base leading-none text-taupe-400 transition-colors duration-300 ease-felt hover:text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
      >
        ⋯
      </button>

      {open && (
        <>
          {/* Voile invisible : un clic dehors referme. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 min-w-36 overflow-hidden rounded-2xl border border-charcoal-600/60 bg-charcoal-800 bg-felt-velvet py-1 shadow-felt"
          >
            {items.map((item, i) => (
              <button
                key={i}
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
        </>
      )}
    </div>
  );
}
