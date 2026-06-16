import { cn } from "../../lib/cn";

export type TabId = "dashboard" | "blog" | "challenges";

interface Tab {
  id: TabId;
  emoji: string;
  label: string;
}

const TABS: Tab[] = [
  { id: "dashboard", emoji: "🏡", label: "Accueil" },
  { id: "blog", emoji: "📖", label: "Blog" },
  { id: "challenges", emoji: "🎲", label: "Défis" },
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
  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        "sticky bottom-0 z-10 flex items-stretch gap-1 border-t border-charcoal-600/60",
        "bg-charcoal-800/90 px-2 pt-1.5 backdrop-blur-md",
        "pb-[calc(0.375rem+env(safe-area-inset-bottom))]",
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
              isActive ? "text-spice-300" : "text-taupe-400 hover:text-taupe-200",
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
            <span className="text-[11px] font-medium">{tab.label}</span>
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
