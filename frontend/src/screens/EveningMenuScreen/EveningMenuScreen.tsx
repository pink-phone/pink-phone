import { useTranslation } from "react-i18next";
import { EveningMenu } from "../../components/EveningMenu/EveningMenu";
import type { ApiEveningMenuItem } from "../../api/types";

export interface EveningMenuScreenProps {
  items: ApiEveningMenuItem[];
  onToggle?: (code: string) => void;
  onBack?: () => void;
}

/** Écran dédié « Menu du soir » (#97b) : effet « boîte à secrets », sorti du
 *  dashboard (allègement UX). Le composant EveningMenu porte son propre titre. */
export function EveningMenuScreen({
  items,
  onToggle,
  onBack,
}: EveningMenuScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ←
          </button>
        )}
      </header>
      <EveningMenu items={items} onToggle={onToggle} />
    </div>
  );
}
