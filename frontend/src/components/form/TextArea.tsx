import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { fieldClass } from "./TextField";

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: string;
}

/** Zone de texte feutrée avec label (récits, descriptions). */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ label, hint, className, rows = 4, ...props }, ref) {
    const id = useId();
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-xs font-medium text-taupe-200">
          {label}
        </label>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className={cn(fieldClass, "resize-none leading-relaxed", className)}
          {...props}
        />
        {hint && <p className="text-[11px] text-taupe-400">{hint}</p>}
      </div>
    );
  },
);
