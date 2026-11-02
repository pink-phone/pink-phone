import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { DesireCard } from "../../components/DesireCard/DesireCard";
import type { ApiDesire } from "../../api/types";

export interface DesiresScreenProps {
  /** Catalogue + mon stance + match/limite/réalisé (déjà chargé par l'orchestration). */
  items: ApiDesire[];
  /** Registre des libellés : explicite (défaut) ou suggestif (#99). */
  explicit?: boolean;
  /** Pose/retire mon « envie » (par code). */
  onToggleWant?: (code: string) => void;
  /** Pose/retire mon « contre » = limite (par code). */
  onToggleAgainst?: (code: string) => void;
  /** Bascule « ✓ Réalisé » (couple) (par code). */
  onToggleDone?: (code: string) => void;
  /** Bouton retour (absent quand la bucket list est un onglet). */
  onBack?: () => void;
}

/** Bucket list (#99) : envies par catégorie (sections repliables). Trois états
 *  (envie/neutre/contre) + « ✓ Réalisé ». Registre de libellés explicite/suggestif.
 *  Contenu (catégories/items) fourni par l'API depuis le catalogue partagé (#0033) —
 *  plus de catalogue codé en dur côté front. */
export function DesiresScreen({
  items,
  explicit = true,
  onToggleWant,
  onToggleAgainst,
  onToggleDone,
  onBack,
}: DesiresScreenProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isEn = i18n.language.startsWith("en");

  const labelFor = (item: ApiDesire): string => {
    if (!explicit) {
      const soft = isEn ? item.labelEnSoft : item.labelFrSoft;
      if (soft) return soft;
    }
    return isEn ? item.labelEn : item.labelFr;
  };

  const descriptionFor = (item: ApiDesire): string | undefined =>
    (isEn ? item.descriptionEn : item.descriptionFr) ?? undefined;

  // Repère de regroupement libre à l'intérieur d'une catégorie (ex.
  // 'kamasutra' → « Kamasutra »). Donnée, pas i18n : capitalisation suffit.
  const subcategoryLabelFor = (item: ApiDesire): string | undefined =>
    item.subcategory
      ? item.subcategory.charAt(0).toUpperCase() + item.subcategory.slice(1)
      : undefined;

  // Catégories dans l'ordre où l'API les renvoie (déjà trié par sort_order).
  const categoryOrder: string[] = [];
  const byCategory = new Map<string, ApiDesire[]>();
  for (const item of items) {
    if (!byCategory.has(item.category)) {
      byCategory.set(item.category, []);
      categoryOrder.push(item.category);
    }
    byCategory.get(item.category)!.push(item);
  }

  return (
    <div className="space-y-v3-5">
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
        <h1 className="flex-1 font-serif text-2xl text-blush-100">
          {t("desires.title")}
        </h1>
      </header>

      <p className="text-sm text-taupe-300">{t("desires.intro")}</p>

      <div className="space-y-v3-3">
        {categoryOrder.map((cat) => {
          const inCat = byCategory.get(cat)!;
          const matches = inCat.filter((d) => d.matched).length;
          const limits = inCat.filter((d) => d.limit).length;
          const dones = inCat.filter((d) => d.done).length;
          const isOpen = open[cat] ?? false;
          const categoryLabel = isEn
            ? inCat[0].categoryLabelEn
            : inCat[0].categoryLabelFr;
          return (
            <section key={cat} className="space-y-v3-3">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-charcoal-600/60 bg-charcoal-800/60 px-4 py-3 text-left transition-colors duration-300 ease-felt hover:border-spice-400/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                <span className="font-serif text-base text-blush-100">
                  {categoryLabel}
                </span>
                <span className="flex items-center gap-2">
                  {matches > 0 && (
                    <span className="rounded-full border border-spice-500/70 bg-bordeaux-700 px-2 py-0.5 text-xs text-blush-100 shadow-glow">
                      ✨ {matches}
                    </span>
                  )}
                  {limits > 0 && (
                    <span className="rounded-full border border-taupe-300/40 px-2 py-0.5 text-xs text-taupe-300">
                      ❌ {limits}
                    </span>
                  )}
                  {dones > 0 && (
                    <span className="rounded-full bg-spice-500/20 px-2 py-0.5 text-xs text-spice-200">
                      ✓ {dones}
                    </span>
                  )}
                  <span aria-hidden className="text-xs text-taupe-400">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3">
                  {inCat.map((d) => (
                    <Fragment key={d.code}>
                      <DesireCard
                        label={labelFor(d)}
                        description={descriptionFor(d)}
                        subcategoryLabel={subcategoryLabelFor(d)}
                        interested={d.interested}
                        against={d.against}
                        matched={d.matched}
                        limit={d.limit}
                        done={d.done}
                        onToggleWant={() => onToggleWant?.(d.code)}
                        onToggleAgainst={
                          onToggleAgainst
                            ? () => onToggleAgainst(d.code)
                            : undefined
                        }
                        onToggleDone={
                          onToggleDone ? () => onToggleDone(d.code) : undefined
                        }
                      />
                    </Fragment>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
