import { useCallback, useState } from "react";
import * as api from "../../api/client";
import type { ApiNotification } from "../../api/types";

/**
 * Centre de notifications du salon : historique + compteur non lu. `refetch`
 * est stable (déps `[spaceId]`) pour être appelé depuis le WS / la resync.
 * Les marquages "lu" sont optimistes (best-effort, comme `useSeen.markSeen`).
 */
export function useNotifications(spaceId: string) {
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const [list, { count }] = await Promise.all([
        api.listNotifications(spaceId),
        api.unreadNotificationCount(spaceId),
      ]);
      setItems(list);
      setUnreadCount(count);
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  const markRead = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      api.markNotificationRead(spaceId, id).catch(() => {});
    },
    [spaceId],
  );

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    api.markAllNotificationsRead(spaceId).catch(() => {});
  }, [spaceId]);

  return { items, unreadCount, refetch, markRead, markAllRead };
}
