// Déverrouillage biométrique LOCAL (FaceID / Touch ID / empreinte Android) en
// complément du code PIN (lib/pin). Comme le PIN, c'est un garde-fou *côté
// appareil*, pas une vraie barrière cryptographique : le vrai cloisonnement
// reste l'auth serveur (JWT).
//
// Il n'existe pas d'API web « FaceID » pour gater une app : on détourne
// WebAuthn (Web Authentication API) avec un *platform authenticator*. À
// l'activation on crée une credential plateforme (l'OS demande la biométrie) ;
// au déverrouillage un `get()` réussi = biométrie validée par l'OS. On ne
// vérifie RIEN côté serveur (déverrouillage local) — la réussite du prompt OS
// suffit. Le PIN reste le repli (biométrie indispo, refusée, ou non configurée).

const KEY = "pp_bio";

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

function randomBytes(n: number): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(n)).buffer as ArrayBuffer;
}

/**
 * La biométrie est-elle disponible sur cet appareil ? (platform authenticator
 * avec vérification d'utilisateur — FaceID/Touch ID/empreinte). Asynchrone.
 */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential ||
      !window.isSecureContext
    ) {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Une credential biométrique est-elle enrôlée sur cet appareil ? */
export function isBiometricEnabled(): boolean {
  return localStorage.getItem(KEY) !== null;
}

/**
 * Enrôle la biométrie : crée une credential plateforme (déclenche le prompt OS)
 * et mémorise son id. Renvoie true si l'utilisateur a validé.
 */
export async function enableBiometric(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: "Pink Phone", id: location.hostname },
        user: {
          id: randomBytes(16),
          name: "pinkphone-local",
          displayName: "Pink Phone",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "discouraged",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(KEY, bufToB64(cred.rawId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Déverrouille par biométrie : `get()` avec la credential enrôlée. Sa réussite
 * = l'OS a validé la biométrie. Renvoie false si indisponible/refusée/annulée.
 */
export async function verifyBiometric(): Promise<boolean> {
  const stored = localStorage.getItem(KEY);
  if (!stored) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        // `transports: ["internal"]` garde le flux SUR l'appareil (Face ID /
        // Touch ID) au lieu de l'UI passkey générique iOS (« clé d'accès » /
        // autre appareil) qui s'affiche quand le transport n'est pas précisé
        // (B-H). Combiné à un `allowCredentials` non vide → prompt biométrique
        // direct de la credential enrôlée, pas un sélecteur de passkeys.
        allowCredentials: [
          { type: "public-key", id: b64ToBuf(stored), transports: ["internal"] },
        ],
        userVerification: "required",
        timeout: 60_000,
        rpId: location.hostname,
      },
    });
    return assertion !== null;
  } catch {
    return false;
  }
}

/** Désactive le déverrouillage biométrique (oublie la credential). */
export function disableBiometric(): void {
  localStorage.removeItem(KEY);
}
