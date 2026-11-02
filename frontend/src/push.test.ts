import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api/client";
import { disablePush, enablePush, pushSupported } from "./push";

vi.mock("./api/client");
const a = vi.mocked(api, true);

const sub = {
  endpoint: "https://push.example/abc",
  toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};
const pushManager = {
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
};

function install(permission: NotificationPermission = "granted") {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve({ pushManager }) },
    configurable: true,
  });
  (window as unknown as { PushManager: unknown }).PushManager = class {};
  (window as unknown as { Notification: unknown }).Notification = {
    requestPermission: vi.fn().mockResolvedValue(permission),
  };
}
function uninstall() {
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  delete (window as unknown as { PushManager?: unknown }).PushManager;
  delete (window as unknown as { Notification?: unknown }).Notification;
}

beforeEach(() => {
  vi.clearAllMocks();
  pushManager.getSubscription.mockResolvedValue(null);
  pushManager.subscribe.mockResolvedValue(sub);
  sub.unsubscribe.mockResolvedValue(true);
  install();
});

describe("push", () => {
  it("pushSupported reflète les API du navigateur", () => {
    expect(pushSupported()).toBe(true);
    uninstall();
    expect(pushSupported()).toBe(false);
  });

  it("enablePush : permission → clé VAPID → abonnement → envoi au backend", async () => {
    a.getVapidKey.mockResolvedValue({ publicKey: "BPAB" });
    await enablePush();
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    const key = pushManager.subscribe.mock.calls[0][0].applicationServerKey as Uint8Array;
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBeGreaterThan(0);
    expect(a.subscribePush).toHaveBeenCalledWith(sub.toJSON());
  });

  it("enablePush : réutilise l'abonnement existant", async () => {
    a.getVapidKey.mockResolvedValue({ publicKey: "BPAB" });
    pushManager.getSubscription.mockResolvedValue(sub);
    await enablePush();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(a.subscribePush).toHaveBeenCalled();
  });

  it("enablePush : navigateur non supporté → erreur", async () => {
    uninstall();
    await expect(enablePush()).rejects.toThrow();
    expect(a.getVapidKey).not.toHaveBeenCalled();
  });

  it("enablePush : permission refusée → erreur, aucun appel réseau", async () => {
    install("denied");
    await expect(enablePush()).rejects.toThrow();
    expect(a.getVapidKey).not.toHaveBeenCalled();
  });

  it("enablePush : serveur sans clé VAPID → erreur", async () => {
    a.getVapidKey.mockResolvedValue({ publicKey: "" });
    await expect(enablePush()).rejects.toThrow();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("disablePush : désabonne le navigateur puis le backend", async () => {
    pushManager.getSubscription.mockResolvedValue(sub);
    a.unsubscribePush.mockResolvedValue(undefined);
    await disablePush();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(a.unsubscribePush).toHaveBeenCalledWith("https://push.example/abc");
  });

  it("disablePush : sans abonnement ou sans support, ne fait rien ; tolère les échecs", async () => {
    await disablePush(); // pas d'abonnement
    expect(a.unsubscribePush).not.toHaveBeenCalled();
    pushManager.getSubscription.mockResolvedValue(sub);
    sub.unsubscribe.mockRejectedValue(new Error("x"));
    a.unsubscribePush.mockRejectedValue(new Error("y"));
    await expect(disablePush()).resolves.toBeUndefined();
    uninstall();
    await expect(disablePush()).resolves.toBeUndefined();
  });
});
