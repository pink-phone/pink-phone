import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export type ServiceCourse = "starter" | "main" | "dessert";

export const SERVICE_COURSES: ServiceCourse[] = ["starter", "main", "dessert"];

export interface CourseCategory {
  id: string;
  label: string;
  /** Services qui l'alimentent dans le classement du catalogue (par défaut). */
  defaultCourses: ServiceCourse[];
}

export interface EveningCourseSettingsProps {
  categories: CourseCategory[];
  /** Le salon a-t-il paramétré ses services ? Faux = classement du catalogue. */
  custom: boolean;
  /** Entrées « <service>:<categorie> » du salon (significatives si `custom`). */
  entries: string[];
  /** Nouveau classement (le parent l'enregistre et passe `custom` à vrai). */
  onChange: (entries: string[]) => void;
  /** Retour au classement du catalogue. */
  onReset: () => void;
  className?: string;
}

const entryOf = (service: ServiceCourse, categoryId: string) => `${service}:${categoryId}`;

/** Classement du catalogue sous forme d'entrées « service:categorie ». */
export function defaultEntries(categories: CourseCategory[]): string[] {
  return categories.flatMap((c) => c.defaultCourses.map((s) => entryOf(s, c.id)));
}

/** La catégorie alimente-t-elle ce service (classement du salon ou du catalogue) ? */
export function isSelected(
  categories: CourseCategory[],
  custom: boolean,
  entries: string[],
  service: ServiceCourse,
  categoryId: string,
): boolean {
  if (custom) return entries.includes(entryOf(service, categoryId));
  return categories.find((c) => c.id === categoryId)?.defaultCourses.includes(service) ?? false;
}

/** Coche/décoche une catégorie pour un service. Au premier changement, le
 *  classement du catalogue est matérialisé en entrées explicites. */
export function toggleEntry(
  categories: CourseCategory[],
  custom: boolean,
  entries: string[],
  service: ServiceCourse,
  categoryId: string,
): string[] {
  const base = custom ? entries : defaultEntries(categories);
  const entry = entryOf(service, categoryId);
  return base.includes(entry) ? base.filter((e) => e !== entry) : [...base, entry];
}

/**
 * Réglage par salon des catégories qui alimentent chaque service du menu du
 * soir : une section repliable par service (Entrée / Plat / Dessert), des
 * puces à cocher — une catégorie peut nourrir plusieurs services. Décochée
 * partout, une catégorie n'alimente aucun service (ses items restent
 * choisissables via « Tout le catalogue »).
 */
export function EveningCourseSettings({
  categories,
  custom,
  entries,
  onChange,
  onReset,
  className,
}: EveningCourseSettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className={cn("space-y-v3-3", className)}>
      <div>
        <p className="font-serif text-base text-blush-100">
          {t("eveningMenu.courseSettings.title")}
        </p>
        <p className="text-xs text-taupe-300">{t("eveningMenu.courseSettings.hint")}</p>
      </div>

      {SERVICE_COURSES.map((service) => {
        const isOpen = open[service] ?? false;
        const chosen = categories.filter((c) =>
          isSelected(categories, custom, entries, service, c.id),
        );
        return (
          <section
            key={service}
            className="rounded-2xl border border-charcoal-600/60 bg-charcoal-800/60"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`course-${service}-panel`}
              onClick={() => setOpen((o) => ({ ...o, [service]: !isOpen }))}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
            >
              <span className="min-w-0">
                <span className="block font-serif text-base text-blush-100">
                  {t(`eveningMenu.course.${service}`)}
                </span>
                <span className="block truncate text-[11px] text-taupe-300">
                  {chosen.length > 0
                    ? chosen.map((c) => c.label).join(", ")
                    : t("eveningMenu.courseSettings.summaryNone")}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "text-taupe-400 transition-transform duration-300 ease-felt",
                  isOpen && "rotate-90",
                )}
              >
                ›
              </span>
            </button>

            {isOpen && (
              <div id={`course-${service}-panel`} className="px-4 pb-3">
                {chosen.length === 0 && (
                  <p className="mb-2 text-xs text-taupe-300">
                    {t("eveningMenu.courseSettings.emptyCourse")}
                  </p>
                )}
                <ul className="flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const on = isSelected(categories, custom, entries, service, cat.id);
                    const original = custom && cat.defaultCourses.includes(service);
                    return (
                      <li key={cat.id}>
                        <label
                          className={cn(
                            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-all duration-300 ease-felt focus-within:ring-2 focus-within:ring-spice-500",
                            on
                              ? "border-spice-400 bg-bordeaux-700 text-blush-100 shadow-glow"
                              : "border-charcoal-600 bg-charcoal-800 text-taupe-200 hover:border-taupe-400",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              onChange(toggleEntry(categories, custom, entries, service, cat.id))
                            }
                            className="sr-only"
                          />
                          {on && <span aria-hidden>✓</span>}
                          {cat.label}
                          {original && (
                            <span
                              role="img"
                              aria-label={t("eveningMenu.courseSettings.originalAria")}
                              className="text-taupe-300"
                            >
                              •
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      {custom && (
        <>
          <p className="text-[11px] text-taupe-300">
            {t("eveningMenu.courseSettings.legend")}
          </p>
          <button
            type="button"
            onClick={onReset}
            className="min-h-11 text-sm text-spice-300 underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
          >
            {t("eveningMenu.courseSettings.reset")}
          </button>
        </>
      )}
    </div>
  );
}
