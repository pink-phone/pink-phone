import { useTranslation } from "react-i18next";
import { Sheet } from "../Sheet/Sheet";
import { Surface } from "../Surface/Surface";
import { Button } from "../Button/Button";

/** Un événement du salon notifié à l'utilisateur courant. */
export interface NotificationItemView {
  id: string;
  /** 'post' | 'comment' | 'challenge' | 'mood' | 'desire' | 'eveningMenu' |
   *  'loveNote' | 'memberJoined' — les types inconnus sont ignorés à l'affichage. */
  kind: string;
  actorName: string | null;
  read: boolean;
  timeLabel: string;
}

export interface NotificationCenterProps {
  open: boolean;
  items: NotificationItemView[];
  loading?: boolean;
  /** Ouvre l'écran concerné par cette notification (marque aussi lue si besoin
   *  — au tap sur n'importe quelle ligne, lue ou non). */
  onOpen: (id: string) => void;
  /** Absent si aucune notification non lue (pas de bouton "tout marquer"). */
  onMarkAllRead?: () => void;
  onClose: () => void;
  className?: string;
}

/** Icône + clé i18n par type d'événement (mêmes pictos que le reste de l'app :
 *  dashboard "Du nouveau", notices de salon, onglets). */
const KIND_META: Record<string, { icon: string; key: string }> = {
  post: { icon: "📖", key: "notifCenter.post" },
  comment: { icon: "💬", key: "notifCenter.comment" },
  challenge: { icon: "🎲", key: "notifCenter.challenge" },
  mood: { icon: "🌦️", key: "notifCenter.mood" },
  desire: { icon: "🔥", key: "notifCenter.desire" },
  eveningMenu: { icon: "🍽️", key: "notifCenter.eveningMenu" },
  loveNote: { icon: "💌", key: "notifCenter.loveNote" },
  memberJoined: { icon: "👋", key: "notifCenter.memberJoined" },
  downloadEnabled: { icon: "⬇️", key: "notifCenter.downloadEnabled" },
};

/** Centre de notifications : historique des événements du salon qui me
 *  concernent, marquables lus individuellement ou tous à la fois. */
export function NotificationCenter({
  open,
  items,
  loading,
  onOpen,
  onMarkAllRead,
  onClose,
  className,
}: NotificationCenterProps) {
  const { t } = useTranslation();
  const shown = items.filter((n) => KIND_META[n.kind]);
  const hasUnread = shown.some((n) => !n.read);

  return (
    <Sheet
      open={open}
      title={t("notifCenter.title")}
      onClose={onClose}
      className={className}
    >
      <div className="space-y-v3-4">
        {hasUnread && onMarkAllRead && (
          <Button variant="secondary" size="sm" onClick={onMarkAllRead}>
            {t("notifCenter.markAllRead")}
          </Button>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm text-taupe-400">
            {t("common.loading")}
          </p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-taupe-400">
            {t("notifCenter.empty")}
          </p>
        ) : (
          <ul className="space-y-v3-2">
            {shown.map((n) => {
              const meta = KIND_META[n.kind];
              const message = t(meta.key as "notifCenter.post", {
                name: n.actorName ?? "?",
              });
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(n.id)}
                    aria-label={t("notifCenter.openAria")}
                    className="block w-full rounded-2xl transition-transform duration-300 ease-felt hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
                  >
                    <Surface
                      tone={n.read ? "velvet" : "deep"}
                      radius="2xl"
                      className="flex items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span aria-hidden className="text-xl">
                        {meta.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <p className="text-sm text-blush-100">{message}</p>
                        <p className="text-[11px] text-blush-200/70">{n.timeLabel}</p>
                      </span>
                      {!n.read && (
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full bg-spice-400"
                        />
                      )}
                      <span aria-hidden className="shrink-0 text-taupe-300">
                        →
                      </span>
                    </Surface>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
