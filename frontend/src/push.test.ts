import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api/client", () => ({
  getVapidKey: vi.fn(),
  subscribePush: vi.fn().mockResolvedValue(undefined),
  unsubscribePush: vi.fn().mockResolvedValue(undefined),
}));

import * as api from "./api/client";
import i18n from "./i18n";
import { disablePush, enablePush, pushSupported } from "./push";

const mocked = vi.mocked(api);

const sub = {
  endpoint: "https://push/ep",
  toJSON: () => ({ endpoint: "https://push/ep" }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};
const pushManager = {
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
};

function installSupport(permission: NotificationPermission = "granted") {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue(permission) });
}

beforeEach(() => {
  vi.clearAllMocks();
  pushManager.getSubscription.mockResolvedValue(null);
  pushManager.subscribe.mockResolvedValue(sub);
  sub.unsubscribe.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error nettoyage du stub navigator
  delete navigator.serviceWorker;
});

describe("pushSupported", () => {
  it("faux sans service worker / PushManager / Notification", () => {
    expect(pushSupported()).toBe(false);
  });

  it("vrai quand tout est présent", () => {
    installSupport();
    expect(pushSupported()).toBe(true);
  });
});

describe("enablePush", () => {
  it("échoue si non supporté", async () => {
    await expect(enablePush()).rejects.toThrow(i18n.t("push.unsupported"));
  });

  it("échoue si la permission est refusée", async () => {
    installSupport("denied");
    await expect(enablePush()).rejects.toThrow(i18n.t("push.denied"));
  });

  it("échoue sans clé VAPID serveur", async () => {
    installSupport();
    mocked.getVapidKey.mockResolvedValue({ publicKey: "" } as never);
    await expect(enablePush()).rejects.toThrow(i18n.t("push.noKeys"));
  });

  it("s'abonne avec la clé décodée puis enregistre côté backend", async () => {
    installSupport();
    mocked.getVapidKey.mockResolvedValue({ publicKey: "AQID_w" } as never);
    await enablePush();
    const opts = pushManager.subscribe.mock.calls[0][0];
    expect(opts.userVisibleOnly).toBe(true);
    expect(Array.from(opts.applicationServerKey as Uint8Array)).toEqual([1, 2, 3, 255]);
    expect(mocked.subscribePush).toHaveBeenCalledWith({ endpoint: "https://push/ep" });
  });

  it("réutilise un abonnement existant", async () => {
    installSupport();
    mocked.getVapidKey.mockResolvedValue({ publicKey: "AQID" } as never);
    pushManager.getSubscription.mockResolvedValue(sub);
    await enablePush();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(mocked.subscribePush).toHaveBeenCalled();
  });
});

describe("disablePush", () => {
  it("no-op si non supporté", async () => {
    await expect(disablePush()).resolves.toBeUndefined();
    expect(mocked.unsubscribePush).not.toHaveBeenCalled();
  });

  it("no-op sans abonnement", async () => {
    installSupport();
    await disablePush();
    expect(mocked.unsubscribePush).not.toHaveBeenCalled();
  });

  it("désabonne l'appareil et le backend, en avalant les erreurs", async () => {
    installSupport();
    pushManager.getSubscription.mockResolvedValue(sub);
    sub.unsubscribe.mockRejectedValue(new Error("x"));
    mocked.unsubscribePush.mockRejectedValue(new Error("y"));
    await expect(disablePush()).resolves.toBeUndefined();
    expect(mocked.unsubscribePush).toHaveBeenCalledWith("https://push/ep");
  });
});
