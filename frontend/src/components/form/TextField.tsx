import { useId, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
}

const fieldClass =
  "w-full rounded-2xl border border-charcoal-600/70 bg-charcoal-800 px-4 py-2.5 text-sm text-taupe-100 " +
  "placeholder:text-taupe-400 shadow-felt-sm transition-colors duration-300 ease-felt " +
  "focus:border-spice-400/60 focus:outline-none focus:ring-2 focus:ring-spice-500";

/** Champ texte feutré avec label. */
export function TextField({ label, hint, className, ...props }: TextFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-taupe-200">
        {label}
      </label>
      <input id={id} className={cn(fieldClass, className)} {...props} />
      {hint && <p className="text-[11px] text-taupe-400">{hint}</p>}
    </div>
  );
}

export { fieldClass };
