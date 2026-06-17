// Verrouillage local par code PIN — un garde-fou *côté appareil* pour qu'un tiers
// qui rouvre le téléphone ne tombe pas directement sur le contenu intime.
//
// Ce n'est PAS un secret cryptographique fort : le hash est en localStorage,
// lisible par qui a déjà un accès complet à l'appareil. Le vrai cloisonnement
// reste l'auth serveur (JWT). Ici on stocke un SHA-256 salé du code, jamais le
// code en clair, et on ne déverrouille que sur correspondance.

const KEY = "pp_pin";

/** Longueur du code PIN (chiffres). */
export const PIN_LENGTH = 4;

interface StoredPin {
  salt: string;
  hash: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/** Un code est-il configuré sur cet appareil ? */
export function isPinSet(): boolean {
  return localStorage.getItem(KEY) !== null;
}

/** Définit (ou remplace) le code PIN local. */
export async function setPin(pin: string): Promise<void> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hash = await hashPin(pin, salt);
  localStorage.setItem(KEY, JSON.stringify({ salt, hash } satisfies StoredPin));
}

/** Vérifie un code saisi contre celui stocké. */
export async function verifyPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const { salt, hash } = JSON.parse(raw) as StoredPin;
    return (await hashPin(pin, salt)) === hash;
  } catch {
    return false;
  }
}

/** Supprime le code (désactive le verrouillage). */
export function clearPin(): void {
  localStorage.removeItem(KEY);
}
