import { useTranslation } from "react-i18next";
import { Button } from "../Button/Button";
import { cn } from "../../lib/cn";

export interface EveningMenuDoneProps {
  /** J'ai validé mon menu de ce soir. */
  meDone: boolean;
  /** Tous les membres ont validé : les choix de chacun sont dévoilés. */
  revealed: boolean;
  /** Prénom du/de la partenaire (couple). */
  partnerName?: string;
  onDone?: () => void;
  onUndo?: () => void;
  className?: string;
}

/**
 * « J'ai fini » du menu du soir en mode aveugle : on valide son menu ; quand
 * tout le monde a fini, les choix de chacun sont dévoilés — matchés ou non.
 * Trois états : à valider · validé, en attente de l'autre (on peut encore
 * « Modifier ») · dévoilé (définitif pour ce soir).
 */
export function EveningMenuDone({
  meDone,
  revealed,
  partnerName,
  onDone,
  onUndo,
  className,
}: EveningMenuDoneProps) {
  const { t } = useTranslation();
  const name = partnerName ?? t("eveningMenu.partner");

  if (revealed) {
    return (
      <p
        role="status"
        className={cn(
          "rounded-2xl border border-spice-500/40 bg-charcoal-800/60 px-4 py-3 text-sm text-blush-100",
          className,
        )}
      >
        {t("eveningMenu.done.revealed", { name })}
      </p>
    );
  }

  if (meDone) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border border-charcoal-600/60 bg-charcoal-800/60 py-2 pl-4 pr-2",
          className,
        )}
      >
        <p role="status" className="text-sm text-taupe-200">
          {t("eveningMenu.done.waiting", { name })}
        </p>
        {onUndo && (
          <Button variant="ghost" onClick={onUndo} className="shrink-0">
            {t("eveningMenu.done.edit")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-taupe-300">{t("eveningMenu.done.hint")}</p>
      <Button onClick={onDone} className="w-full">
        {t("eveningMenu.done.action")}
      </Button>
    </div>
  );
}
