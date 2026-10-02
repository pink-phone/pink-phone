import { useTranslation } from "react-i18next";
import { EveningMenuEntry } from "../EveningMenuEntry/EveningMenuEntry";
import { Button } from "../Button/Button";
import { cn } from "../../lib/cn";
import type { ApiEveningMenuItem } from "../../api/types";

export interface EveningMenuProps {
  /** Items d'UN service (déjà filtrés par l'appelant) — catalogue complet :
   *  le panneau n'affiche que ceux qui sont « sur le menu » ce soir. */
  items: ApiEveningMenuItem[];
  /** Registre des libellés : explicite (défaut) ou suggestif (#99), hérité de
   *  la bucket list (le Dessert reprend les items « practices »). */
  explicit?: boolean;
  /** Bascule mon choix du soir (par code) — « Partant·e » sur une proposition
   *  de l'autre, et repli de `onRemove` s'il est absent. */
  onToggle?: (code: string) => void;
  /** Retire mon choix (✕). Reçoit l'item et son libellé résolu : l'appelant
   *  gère confirmation (match) et annulation. */
  onRemove?: (item: ApiEveningMenuItem, label: string) => void;
  /** Prénom du/de la partenaire pour les lignes de statut. */
  partnerName?: string;
  /** Mode ouvert (#0040) : refuse une proposition (par code). Présent ⇒
   *  affiche le bouton refuser sur les propositions en attente. */
  onRefuse?: (code: string) => void;
  /** Ouvre l'écran de recherche/sélection du service. */
  onAdd?: () => void;
  className?: string;
}

/** Un item est « sur le menu » s'il est coché, matché, proposé par le/la
 *  partenaire (mode ouvert) ou refusé (trace de la décision). */
export const isOnMenu = (i: ApiEveningMenuItem): boolean =>
  i.picked || i.matched || Boolean(i.partnerWants) || Boolean(i.refused);

/**
 * Panneau d'UN service du menu du soir (#97b, #0039, refacto 114d) : liste ce
 * qui est sélectionné pour ce soir + bouton « Ajouter » qui ouvre l'écran de
 * recherche/sélection multiple. Même présentation pour Entrée, Plat et Dessert.
 * Un item matché (les deux l'ont coché aujourd'hui) s'illumine (braise + ✨).
 */
export function EveningMenu({
  items,
  explicit = true,
  onToggle,
  onRemove,
  partnerName,
  onRefuse,
  onAdd,
  className,
}: EveningMenuProps) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");

  const selected = items.filter(isOnMenu);
  const matchCount = items.filter((i) => i.matched && i.picked).length;

  const labelFor = (item: ApiEveningMenuItem): string => {
    if (!explicit) {
      const soft = isEn ? item.labelEnSoft : item.labelFrSoft;
      if (soft) return soft;
    }
    return isEn ? item.labelEn : item.labelFr;
  };
  const descriptionFor = (item: ApiEveningMenuItem): string | undefined =>
    (isEn ? item.descriptionEn : item.descriptionFr) ?? undefined;
  const subcategoryLabelFor = (item: ApiEveningMenuItem): string | undefined =>
    item.subcategory
      ? item.subcategory.charAt(0).toUpperCase() + item.subcategory.slice(1)
      : undefined;

  return (
    <section className={cn("space-y-v3-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-taupe-100">{t("eveningMenu.title")}</h2>
        {matchCount > 0 && (
          <span className="rounded-full border border-spice-500/70 bg-bordeaux-700 px-2.5 py-0.5 text-xs text-blush-100 shadow-glow">
            {t("eveningMenu.matchCount", { count: matchCount })}
          </span>
        )}
      </div>
      <p className="text-xs text-taupe-400">{t("eveningMenu.intro")}</p>

      {selected.length === 0 ? (
        <p className="py-4 text-center font-serif text-sm text-taupe-400">
          {t("eveningMenu.emptyCourse")}
        </p>
      ) : (
        <div role="list" className="flex flex-col gap-2">
          {selected.map((i) => (
            <EveningMenuEntry
              key={i.code}
              label={labelFor(i)}
              description={descriptionFor(i)}
              subcategoryLabel={subcategoryLabelFor(i)}
              picked={i.picked}
              matched={i.matched}
              partnerWants={i.partnerWants}
              refused={i.refused}
              openMode={Boolean(onRefuse)}
              partnerName={partnerName}
              onAccept={() => onToggle?.(i.code)}
              onRemove={() =>
                onRemove ? onRemove(i, labelFor(i)) : onToggle?.(i.code)
              }
              onRefuse={onRefuse ? () => onRefuse(i.code) : undefined}
            />
          ))}
        </div>
      )}

      {onAdd && (
        <Button variant="secondary" onClick={onAdd} className="w-full">
          {t("eveningMenu.add")}
        </Button>
      )}
    </section>
  );
}
