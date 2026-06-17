import type { ReactNode } from "react";
import { BottomNav, type TabId } from "../BottomNav/BottomNav";
import { cn } from "../../lib/cn";

export interface AppShellProps {
  active: TabId;
  onTabChange: (tab: TabId) => void;
  badges?: Partial<Record<TabId, number>>;
  children: ReactNode;
  className?: string;
}

/**
 * Coquille de l'app : zone de contenu scrollable + navigation fixe en bas.
 * Dimensionnée comme un téléphone (mobile-first PWA).
 */
export function AppShell({
  active,
  onTabChange,
  badges,
  children,
  className,
}: AppShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-charcoal-900 bg-felt-velvet",
        className,
      )}
    >
      <main className="flex-1 overflow-y-auto px-4 pb-6 pt-[calc(1rem+env(safe-area-inset-top))]">
        {children}
      </main>
      <BottomNav active={active} onChange={onTabChange} badges={badges} />
    </div>
  );
}
