import { useTranslation } from "react-i18next";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { cn } from "../../lib/cn";

export type Course = "starter" | "main" | "dessert";
export type CourseStatus = "neutral" | "picked" | "matched";

export interface CourseTabsProps {
  active: Course;
  statuses: Record<Course, CourseStatus>;
  onChange: (course: Course) => void;
  className?: string;
}

const ORDER: Course[] = ["starter", "main", "dessert"];

const ICON: Record<CourseStatus, string> = {
  neutral: "○",
  picked: "✓",
  matched: "✨",
};

/**
 * Barre à 3 segments (Entrée/Plat/Dessert) du menu du soir (#97b, #0039).
 * Tous les services restent accessibles en permanence (pas de verrouillage
 * séquentiel) — l'ordre suit juste la lecture d'un menu, pas une contrainte.
 * Chaque segment porte son propre statut (○ neutre / ✓ coché / ✨ matché ce
 * soir), qui sert de « ticket de commande » sans strip de résumé séparée.
 * Quand les 3 services sont matchés, le conteneur entier reçoit le même
 * traitement (braise + halo) qu'un item matché.
 */
export function CourseTabs({ active, statuses, onChange, className }: CourseTabsProps) {
  const { t } = useTranslation();
  const allMatched = ORDER.every((c) => statuses[c] === "matched");

  return (
    <div
      role="tablist"
      aria-label={t("eveningMenu.courseTabsAria")}
      className={cn(
        "relative flex gap-1 overflow-hidden rounded-full border border-charcoal-600/60 bg-charcoal-800/60 p-1 shadow-felt-sm transition-all duration-300 ease-felt",
        allMatched &&
          "border-bordeaux-600 shadow-ember animate-ember-breathe motion-reduce:animate-none",
        className,
      )}
    >
      {allMatched && <FireEmbers count={8} />}
      {ORDER.map((course) => {
        const isActive = course === active;
        const status = statuses[course];
        return (
          <button
            key={course}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(course)}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors duration-300 ease-felt focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spice-500",
              isActive
                ? "bg-spice-500/15 text-blush-100"
                : "text-taupe-300 hover:text-taupe-100",
              status === "matched" && !allMatched && "shadow-glow",
            )}
          >
            <span aria-hidden>{ICON[status]}</span>
            <span className="font-serif">{t(`eveningMenu.course.${course}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
