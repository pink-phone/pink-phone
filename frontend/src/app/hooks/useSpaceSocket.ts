import { useEffect, useRef } from "react";
import * as api from "../../api/client";

/**
 * Cycle de vie du WebSocket de refresh temps réel : connexion, reconnexion auto
 * (3 s) et nettoyage. Les événements portent juste un `kind` (« quelque chose a
 * changé ») ; le quoi-refetch reste à l'appelant via `onEvent`.
 *
 * `onEvent` est lu via une ref : il peut donc fermer sur l'état courant (onglet,
 * fil ouvert…) sans forcer une reconnexion à chaque rendu (l'effet ne dépend que
 * de l'espace et du jeton).
 */
export function useSpaceSocket(
  spaceId: string,
  token: string | null,
  onEvent: (kind: string) => void,
) {
  // Mise à jour de ref directe (synchrone, pendant le rendu) : pas besoin d'un
  // useEffect dédié — la ref est à jour avant le prochain message WS (REACT-03).
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      socket = new WebSocket(api.spaceSocketUrl(spaceId, token));
      socket.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as { kind?: string };
          if (ev.kind) onEventRef.current(ev.kind);
        } catch {
          /* message non-JSON ignoré */
        }
      };
      socket.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [spaceId, token]);
}
