import * as api from "./api/client";
import i18n from "./i18n";

/** Le navigateur supporte-t-il le Web Push ? */
export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // ArrayBuffer explicite (et non ArrayBufferLike) pour satisfaire BufferSource.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Demande la permission, s'abonne au push avec la clé VAPID du serveur,
 * et enregistre l'abonnement côté backend. À appeler quand l'utilisateur
 * choisit le mode "push".
 */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error(i18n.t("push.unsupported"));
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(i18n.t("push.denied"));
  }

  const { publicKey } = await api.getVapidKey();
  if (!publicKey) {
    throw new Error(i18n.t("push.noKeys"));
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await api.subscribePush(sub.toJSON());
}

/** Désabonne l'appareil (mode "digest" ou "ghost"). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await api.unsubscribePush(endpoint).catch(() => {});
}
