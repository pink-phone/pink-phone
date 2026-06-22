import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export type TabId = "dashboard" | "blog" | "challenges";

interface Tab {
  id: TabId;
  emoji: string;
}

const TABS: Tab[] = [
  { id: "dashboard", emoji: "🏡" },
  { id: "blog", emoji: "📖" },
  { id: "challenges", emoji: "🎲" },
];

export interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  /** Pastilles de nouveautés par onglet. */
  badges?: Partial<Record<TabId, number>>;
  className?: string;
}

/** Barre d'onglets fixe en bas (pattern PWA), avec safe-area. */
export function BottomNav({ active, onChange, badges = {}, className }: BottomNavProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("nav.aria")}
      className={cn(
        "sticky bottom-0 z-10 flex items-stretch gap-1 border-t border-charcoal-600/60",
        "bg-charcoal-800/90 px-2 pt-1 backdrop-blur-md",
        // Colle la barre au bas : on garde la safe-area iOS (home indicator) avec
        // un minimum pour les écrans sans encoche, mais sans bande superflue.
        "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        const badge = badges[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              isActive ? "text-spice-300" : "text-taupe-300 hover:text-taupe-100",
            )}
          >
            <span
              className={cn(
                "text-xl transition-transform duration-300 ease-felt",
                isActive && "scale-110 drop-shadow-[0_0_8px_rgba(184,92,114,0.6)]",
              )}
            >
              {tab.emoji}
            </span>
            <span className="text-[11px] font-medium">{t(`nav.${tab.id}`)}</span>
            {badge > 0 && (
              <span className="absolute right-4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-spice-500 px-1 text-[10px] font-semibold text-blush-50">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
