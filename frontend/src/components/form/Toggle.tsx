import { cn } from "../../lib/cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
}

/** Interrupteur feutré (ex: activer le mode éphémère "view once"). */
export function Toggle({ checked, onChange, label, hint, className }: ToggleProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 select-none",
        className,
      )}
    >
      <span className="leading-tight">
        <span className="block text-sm text-taupe-100">{label}</span>
        {hint && <span className="block text-[11px] text-taupe-400">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-300 ease-felt",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
          checked
            ? "border-spice-500/70 bg-spice-500/80 shadow-glow"
            : "border-charcoal-600/70 bg-charcoal-700",
        )}
      >
        <span
          className={cn(
            "absolute left-1 top-1 h-5 w-5 rounded-full bg-blush-50 shadow-felt-sm transition-transform duration-300 ease-felt",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </label>
  );
}
