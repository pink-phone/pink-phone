import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../Button/Button";
import { MenuMark, type MenuMarkState } from "../MenuMark/MenuMark";
import { fieldClass } from "../form/TextField";
import { cn } from "../../lib/cn";
import type { ApiEveningMenuItem } from "../../api/types";

export interface EveningMenuPickerProps {
  /** Tout le catalogue du menu du soir. Le sélecteur n'affiche d'abord que les
   *  items du service `course` (catégories du service) ; « Tout le catalogue »
   *  permet de piocher hors de ces catégories. */
  items: ApiEveningMenuItem[];
  /** Service en cours d'édition (filtre par défaut). */
  course: "starter" | "main" | "dessert";
  /** Registre des libellés : explicite (défaut) ou suggestif (#99). */
  explicit?: boolean;
  /** Prénom du/de la partenaire (ligne « X est partant·e »). */
  partnerName?: string;
  /** Validation : la sélection finale (codes). L'appelant en déduit le diff. */
  onConfirm: (codes: string[]) => void;
  onCancel: () => void;
  className?: string;
}

/** Au-delà de ce volume, les items sont regroupés (repliés) par sous-catégorie
 *  tant qu'aucune recherche n'est active. */
export const GROUPED_PICKER_THRESHOLD = 25;

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Écran de recherche/sélection multiple d'UN service du menu du soir (#97b,
 * refacto 114d). La sélection est un brouillon local : rien n'est envoyé avant
 * « Valider », « Annuler » jette le brouillon. Un item refusé (mode ouvert)
 * n'est pas proposé. La marque de sélection est une coche, pas un cœur.
 */
export function EveningMenuPicker({
  items,
  course,
  explicit = true,
  partnerName,
  onConfirm,
  onCancel,
  className,
}: EveningMenuPickerProps) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Proposé dans ce service : ses catégories l'alimentent (plusieurs services
  // possibles), ou — sans classement détaillé — le service affiché de l'item.
  const inCourse = items.filter((i) => (i.courses ? i.courses.includes(course) : i.course === course));
  // Service sans item (catégories toutes réaffectées) : on ouvre direct tout le catalogue.
  const [scope, setScope] = useState<"course" | "all">(
    inCourse.length === 0 ? "all" : "course",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.picked).map((i) => i.code)),
  );

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
  const categoryLabelFor = (item: ApiEveningMenuItem): string =>
    isEn ? item.categoryLabelEn : item.categoryLabelFr;

  const available = (scope === "all" ? items : inCourse).filter((i) => !i.refused);
  const query = search.trim();
  const filtered = query
    ? available.filter((i) =>
        normalize(
          [labelFor(i), descriptionFor(i) ?? "", subcategoryLabelFor(i) ?? ""].join(" "),
        ).includes(normalize(query)),
      )
    : available;
  const grouped = !query && available.length > GROUPED_PICKER_THRESHOLD;

  const groupOrder: string[] = [];
  const groups = new Map<string, { label: string; items: ApiEveningMenuItem[] }>();
  if (grouped) {
    for (const item of filtered) {
      const key = item.subcategory ?? item.category;
      if (!groups.has(key)) {
        groups.set(key, {
          label: subcategoryLabelFor(item) ?? categoryLabelFor(item),
          items: [],
        });
        groupOrder.push(key);
      }
      groups.get(key)!.items.push(item);
    }
  }

  const toggle = (code: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const row = (i: ApiEveningMenuItem, showSub: boolean) => {
    const on = selected.has(i.code);
    const sub = showSub ? subcategoryLabelFor(i) : undefined;
    const name = partnerName ?? t("eveningMenu.partner");
    const proposed = i.partnerWants && !i.picked;
    // Décocher un match existant le défait : on le signale avant de valider.
    const breaks = i.picked && i.matched && !on;
    const mark: MenuMarkState = on
      ? i.picked && i.matched
        ? "match"
        : "mine"
      : proposed
        ? "proposed"
        : "empty";
    const status = breaks
      ? t("eveningMenu.breaksMatch")
      : proposed && !on
        ? t("eveningMenu.partnerWants", { name })
        : undefined;
    return (
      <button
        key={i.code}
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => toggle(i.code)}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-felt transition-all duration-300 ease-felt focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500",
          on
            ? "border-spice-500/70 bg-charcoal-800 bg-felt-linen text-blush-100"
            : "border-charcoal-600/60 bg-charcoal-800 bg-felt-linen text-taupe-200 hover:border-spice-400/40",
        )}
      >
        <MenuMark state={mark} />
        <span className="min-w-0 flex-1">
          {sub && (
            <span className="block text-[10px] uppercase tracking-wide text-taupe-300">
              {sub}
            </span>
          )}
          <span className="block font-serif text-base">{labelFor(i)}</span>
          {descriptionFor(i) && (
            <span className="mt-0.5 block text-xs text-taupe-300">{descriptionFor(i)}</span>
          )}
          {status && (
            <span
              className={cn(
                "mt-1 block text-[11px]",
                breaks ? "text-spice-300" : "text-taupe-300",
              )}
            >
              {status}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h2 className="font-serif text-lg text-taupe-100">{t("eveningMenu.pickerTitle")}</h2>

      <div
        role="radiogroup"
        aria-label={t("eveningMenu.scopeAria")}
        className="flex gap-1 rounded-full border border-charcoal-600/60 bg-charcoal-800/60 p-1"
      >
        {(["course", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={scope === value}
            onClick={() => setScope(value)}
            className={cn(
              "min-h-9 flex-1 rounded-full px-3 text-sm transition-colors duration-300 ease-felt focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500",
              scope === value
                ? "bg-spice-500/15 text-blush-100"
                : "text-taupe-300 hover:text-taupe-100",
            )}
          >
            {value === "course"
              ? t(`eveningMenu.course.${course}`)
              : t("eveningMenu.scopeAll")}
          </button>
        ))}
      </div>

      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-taupe-400"
        >
          🔍
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("eveningMenu.searchPlaceholder")}
          aria-label={t("eveningMenu.searchPlaceholder")}
          className={cn(fieldClass, "pl-9", search && "pr-9")}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label={t("eveningMenu.searchClear")}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-taupe-400 hover:text-taupe-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
          >
            ✕
          </button>
        )}
      </div>

      {grouped ? (
        <div className="space-y-v3-3">
          {groupOrder.map((key) => {
            const group = groups.get(key)!;
            const isOpen = open[key] ?? false;
            const count = group.items.filter((i) => selected.has(i.code)).length;
            return (
              <section key={key} className="space-y-v3-2">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border border-charcoal-600/60 bg-charcoal-800/60 px-4 py-3 text-left transition-colors duration-300 ease-felt hover:border-spice-400/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
                >
                  <span className="font-serif text-base text-blush-100">{group.label}</span>
                  <span className="flex items-center gap-2">
                    {count > 0 && (
                      <span className="rounded-full border border-spice-500/70 px-2 py-0.5 text-xs text-blush-100">
                        ✓ {count}
                      </span>
                    )}
                    <span aria-hidden className="text-xs text-taupe-400">
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-2">
                    {group.items.map((i) => row(i, false))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center font-serif text-sm text-taupe-400">
              {t("eveningMenu.searchEmpty", { query })}
            </p>
          ) : (
            filtered.map((i) => row(i, true))
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-charcoal-900/90 px-1 py-3 backdrop-blur">
        <Button variant="ghost" onClick={onCancel} className="flex-1">
          {t("common.cancel")}
        </Button>
        <Button onClick={() => onConfirm([...selected])} className="flex-1">
          {t("eveningMenu.pickerConfirm", { count: selected.size })}
        </Button>
      </div>
    </section>
  );
}
