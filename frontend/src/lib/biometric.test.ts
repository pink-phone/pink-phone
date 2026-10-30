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

beforeEach(() => {
  localStorage.clear();
  create.mockReset();
  get.mockReset();
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { create, get },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isBiometricSupported", () => {
  it("faux sans PublicKeyCredential", async () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    await expect(isBiometricSupported()).resolves.toBe(false);
  });

  it("reflète la dispo du platform authenticator en contexte sécurisé", async () => {
    const avail = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: avail,
    });
    vi.stubGlobal("isSecureContext", true);
    await expect(isBiometricSupported()).resolves.toBe(true);
    avail.mockResolvedValue(false);
    await expect(isBiometricSupported()).resolves.toBe(false);
  });

  it("faux hors contexte sécurisé", async () => {
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    });
    vi.stubGlobal("isSecureContext", false);
    await expect(isBiometricSupported()).resolves.toBe(false);
  });

  it("faux si l'API lève", async () => {
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockRejectedValue(new Error("x")),
    });
    vi.stubGlobal("isSecureContext", true);
    await expect(isBiometricSupported()).resolves.toBe(false);
  });
});

describe("enableBiometric", () => {
  it("mémorise l'id de la credential créée", async () => {
    create.mockResolvedValue({ rawId: new Uint8Array([1, 2, 3]).buffer });
    await expect(enableBiometric()).resolves.toBe(true);
    expect(isBiometricEnabled()).toBe(true);
    const opts = create.mock.calls[0][0].publicKey;
    expect(opts.authenticatorSelection.authenticatorAttachment).toBe("platform");
    expect(opts.authenticatorSelection.userVerification).toBe("required");
  });

  it("false si l'utilisateur annule (null) ou si l'OS lève", async () => {
    create.mockResolvedValueOnce(null);
    await expect(enableBiometric()).resolves.toBe(false);
    create.mockRejectedValueOnce(new Error("NotAllowed"));
    await expect(enableBiometric()).resolves.toBe(false);
    expect(isBiometricEnabled()).toBe(false);
  });
});

describe("verifyBiometric", () => {
  it("false sans credential enrôlée (aucun prompt)", async () => {
    await expect(verifyBiometric()).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("true quand l'assertion réussit, avec la credential enrôlée", async () => {
    create.mockResolvedValue({ rawId: new Uint8Array([9, 8, 7]).buffer });
    await enableBiometric();
    get.mockResolvedValue({});
    await expect(verifyBiometric()).resolves.toBe(true);
    const allow = get.mock.calls[0][0].publicKey.allowCredentials[0];
    expect(Array.from(new Uint8Array(allow.id))).toEqual([9, 8, 7]);
    expect(allow.transports).toEqual(["internal"]);
  });

  it("false si refusée (null) ou si ça lève", async () => {
    localStorage.setItem("pp_bio", btoa("abc"));
    get.mockResolvedValueOnce(null);
    await expect(verifyBiometric()).resolves.toBe(false);
    get.mockRejectedValueOnce(new Error("cancel"));
    await expect(verifyBiometric()).resolves.toBe(false);
  });
});

describe("disableBiometric", () => {
  it("oublie la credential", () => {
    localStorage.setItem("pp_bio", "x");
    disableBiometric();
    expect(isBiometricEnabled()).toBe(false);
  });
});
