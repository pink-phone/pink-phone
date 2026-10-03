import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disableBiometric,
  enableBiometric,
  isBiometricEnabled,
  isBiometricSupported,
  verifyBiometric,
} from "./biometric";

const create = vi.fn();
const get = vi.fn();
let store: Map<string, string>;

function stubWebAuthn({ available = true, secure = true } = {}) {
  vi.stubGlobal("PublicKeyCredential", {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(available),
  });
  (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = (
    globalThis as unknown as { PublicKeyCredential: unknown }
  ).PublicKeyCredential;
  Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
}

beforeEach(() => {
  create.mockReset();
  get.mockReset();
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  Object.defineProperty(navigator, "credentials", { value: { create, get }, configurable: true });
  stubWebAuthn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
});

describe("isBiometricSupported", () => {
  it("true quand un authenticator plateforme est disponible en contexte sécurisé", async () => {
    await expect(isBiometricSupported()).resolves.toBe(true);
  });

  it("false sans WebAuthn, hors contexte sécurisé, sans authenticator ou si la détection plante", async () => {
    delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    await expect(isBiometricSupported()).resolves.toBe(false);

    stubWebAuthn({ secure: false });
    await expect(isBiometricSupported()).resolves.toBe(false);

    stubWebAuthn({ available: false });
    await expect(isBiometricSupported()).resolves.toBe(false);

    stubWebAuthn();
    (window.PublicKeyCredential as unknown as { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean> })
      .isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.reject(new Error("x"));
    await expect(isBiometricSupported()).resolves.toBe(false);
  });
});

describe("enrôlement / vérification / désactivation", () => {
  const raw = new Uint8Array([1, 2, 3, 250]).buffer;

  it("enableBiometric : crée une credential plateforme et mémorise son id", async () => {
    create.mockResolvedValue({ rawId: raw });
    expect(isBiometricEnabled()).toBe(false);
    await expect(enableBiometric()).resolves.toBe(true);
    expect(isBiometricEnabled()).toBe(true);
    const opts = create.mock.calls[0][0].publicKey;
    expect(opts.authenticatorSelection).toMatchObject({
      authenticatorAttachment: "platform",
      userVerification: "required",
    });
    expect(opts.challenge.byteLength).toBe(32);
    expect(store.get("pp_bio")).toBe(btoa(String.fromCharCode(1, 2, 3, 250)));
  });

  it("enableBiometric : annulé (null) ou refusé (exception) → false, rien mémorisé", async () => {
    create.mockResolvedValueOnce(null);
    await expect(enableBiometric()).resolves.toBe(false);
    create.mockRejectedValueOnce(new Error("NotAllowedError"));
    await expect(enableBiometric()).resolves.toBe(false);
    expect(isBiometricEnabled()).toBe(false);
  });

  it("verifyBiometric : sans credential enrôlée → false, sans prompt", async () => {
    await expect(verifyBiometric()).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("verifyBiometric : réussite = assertion non nulle, avec la credential enrôlée", async () => {
    store.set("pp_bio", btoa(String.fromCharCode(1, 2, 3, 250)));
    get.mockResolvedValue({});
    await expect(verifyBiometric()).resolves.toBe(true);
    const cred = get.mock.calls[0][0].publicKey.allowCredentials[0];
    expect(cred.transports).toEqual(["internal"]);
    expect(Array.from(new Uint8Array(cred.id))).toEqual([1, 2, 3, 250]);
  });

  it("verifyBiometric : annulée / refusée → false", async () => {
    store.set("pp_bio", btoa("abc"));
    get.mockResolvedValueOnce(null);
    await expect(verifyBiometric()).resolves.toBe(false);
    get.mockRejectedValueOnce(new Error("NotAllowedError"));
    await expect(verifyBiometric()).resolves.toBe(false);
  });

  it("disableBiometric : oublie la credential", () => {
    store.set("pp_bio", "x");
    disableBiometric();
    expect(isBiometricEnabled()).toBe(false);
  });
});
