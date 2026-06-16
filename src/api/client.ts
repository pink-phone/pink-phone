import type { MoodId } from "../components/MoodSelector/moods";
import type {
  ChallengeStatus,
  Intensity,
} from "../components/ChallengeCard/challenge";
import type { Verdict } from "../components/VerdictPicker/VerdictPicker";
import type {
  ApiChallenge,
  ApiComment,
  ApiPost,
  AuthConfig,
  ChallengeSuggestion,
  AuthResponse,
  Member,
  MediaCreated,
  MoodEntry,
  NotifMode,
  ReactionSummary,
  Settings,
  Space,
  UserPublic,
  VapidKey,
} from "./types";

const BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:8080";

/** Erreur HTTP portant le code et le message renvoyé par l'API. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Le jeton est gardé en module + persisté par l'AuthProvider.
let token: string | null = null;
export function setToken(value: string | null) {
  token = value;
}

function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ReqOptions {
  method?: string;
  json?: unknown;
}

async function req<T>(path: string, opts: ReqOptions = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });

  if (!res.ok) {
    const msg = await res
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined);
    throw new ApiError(res.status, msg ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Réessaie une requête sur échec transitoire (réseau, swap du service worker…). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// ---------- Auth ----------

export const register = (
  email: string,
  displayName: string,
  password: string,
) =>
  req<AuthResponse>("/api/auth/register", {
    method: "POST",
    json: { email, display_name: displayName, password },
  });

export const login = (email: string, password: string) =>
  req<AuthResponse>("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });

export const me = () => req<UserPublic>("/api/auth/me");

/**
 * Méthodes d'auth disponibles (mot de passe et/ou OIDC).
 * Avec retry : un échec transitoire ne doit pas faire disparaître le bouton SSO.
 */
export const getAuthConfig = () =>
  withRetry(() => req<AuthConfig>("/api/auth/config"));

/** URL de démarrage du flux OIDC (redirection plein écran, pas un fetch). */
export const oidcLoginUrl = () => `${BASE}/api/auth/oidc/login`;

/**
 * URL du WebSocket de refresh temps réel d'un espace. Le jeton passe en query
 * (pas d'en-tête Authorization possible sur un handshake WS navigateur). En prod
 * `BASE` est relatif ("") → on dérive l'origine de la page.
 */
export function spaceSocketUrl(spaceId: string, token: string): string {
  const origin = BASE || window.location.origin;
  const wsOrigin = origin.replace(/^http/, "ws"); // http→ws, https→wss
  return `${wsOrigin}/api/spaces/${spaceId}/ws?token=${encodeURIComponent(token)}`;
}

// ---------- Espaces ----------

export const createSpace = (name: string) =>
  req<Space>("/api/spaces", { method: "POST", json: { name } });

export const mySpaces = () => req<Space[]>("/api/spaces/me");

export const joinSpace = (spaceId: string) =>
  req<Space>(`/api/spaces/${spaceId}/join`, { method: "POST" });

export const members = (spaceId: string) =>
  req<Member[]>(`/api/spaces/${spaceId}/members`);

// ---------- Mood ----------

export const setMood = (spaceId: string, status: MoodId) =>
  req<MoodEntry>(`/api/spaces/${spaceId}/mood`, {
    method: "PUT",
    json: { status },
  });

export const listMoods = (spaceId: string) =>
  req<MoodEntry[]>(`/api/spaces/${spaceId}/moods`);

// ---------- Posts ----------

export const listPosts = (spaceId: string) =>
  req<ApiPost[]>(`/api/spaces/${spaceId}/posts`);

export const createPost = (
  spaceId: string,
  body: { title?: string; body: string; mediaId?: string; draft?: boolean },
) => req<ApiPost>(`/api/spaces/${spaceId}/posts`, { method: "POST", json: body });

export const deletePost = (spaceId: string, postId: string) =>
  req<void>(`/api/spaces/${spaceId}/posts/${postId}`, { method: "DELETE" });

/**
 * Met à jour un post (auteur). Titre/récit éditables uniquement sur un
 * brouillon ; `draft` change le statut. Champs absents = inchangés.
 */
export const updatePost = (
  spaceId: string,
  postId: string,
  body: {
    title?: string;
    body?: string;
    draft?: boolean;
    /** Attache/remplace le média. */
    mediaId?: string;
    /** Détache le média existant. */
    clearMedia?: boolean;
  },
) =>
  req<ApiPost>(`/api/spaces/${spaceId}/posts/${postId}`, {
    method: "PATCH",
    json: body,
  });

/** Publie un brouillon (draft -> false) ; déclenche la notification. */
export const publishPost = (spaceId: string, postId: string) =>
  updatePost(spaceId, postId, { draft: false });

// ---------- Interactions (réactions / verdict / commentaires) ----------

export const addReaction = (
  spaceId: string,
  postId: string,
  reaction: string,
) =>
  req<ReactionSummary>(`/api/spaces/${spaceId}/posts/${postId}/reactions`, {
    method: "POST",
    json: { reaction },
  });

export const removeReaction = (
  spaceId: string,
  postId: string,
  reaction: string,
) =>
  req<ReactionSummary>(
    // La réaction peut être un emoji libre : on encode pour le path.
    `/api/spaces/${spaceId}/posts/${postId}/reactions/${encodeURIComponent(reaction)}`,
    { method: "DELETE" },
  );

export const setVerdict = (spaceId: string, postId: string, verdict: Verdict) =>
  req<{ verdict: Verdict | null }>(
    `/api/spaces/${spaceId}/posts/${postId}/verdict`,
    { method: "PUT", json: { verdict } },
  );

export const listComments = (spaceId: string, postId: string) =>
  req<ApiComment[]>(`/api/spaces/${spaceId}/posts/${postId}/comments`);

export const addComment = (spaceId: string, postId: string, body: string) =>
  req<ApiComment>(`/api/spaces/${spaceId}/posts/${postId}/comments`, {
    method: "POST",
    json: { body },
  });

// ---------- Défis ----------

export const listChallenges = (spaceId: string) =>
  req<ApiChallenge[]>(`/api/spaces/${spaceId}/challenges`);

/** Banque de propositions de défis (globale, curée). */
export const listChallengeSuggestions = () =>
  req<ChallengeSuggestion[]>("/api/challenge-suggestions");

export const createChallenge = (
  spaceId: string,
  body: {
    title: string;
    description: string;
    intensity: Intensity;
    deadlineLabel?: string;
  },
) =>
  req<ApiChallenge>(`/api/spaces/${spaceId}/challenges`, {
    method: "POST",
    json: body,
  });

export const transitionChallenge = (
  spaceId: string,
  challengeId: string,
  status: ChallengeStatus,
) =>
  req<ApiChallenge>(
    `/api/spaces/${spaceId}/challenges/${challengeId}/status`,
    { method: "PATCH", json: { status } },
  );

export const deleteChallenge = (spaceId: string, challengeId: string) =>
  req<void>(`/api/spaces/${spaceId}/challenges/${challengeId}`, {
    method: "DELETE",
  });

// ---------- Médias ----------

export async function uploadMedia(
  spaceId: string,
  file: File,
  viewOnce: boolean,
): Promise<MediaCreated> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("viewOnce", String(viewOnce));
  const res = await fetch(`${BASE}/api/spaces/${spaceId}/media`, {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status, "upload échoué");
  return (await res.json()) as MediaCreated;
}

// ---------- Notifications ----------

export const getSettings = () => req<Settings>("/api/me/settings");

export const updateSettings = (notifMode: NotifMode) =>
  req<Settings>("/api/me/settings", {
    method: "PUT",
    json: { notifMode },
  });

export const getVapidKey = () =>
  req<VapidKey>("/api/notifications/vapid");

export const subscribePush = (subscription: PushSubscriptionJSON) =>
  req<{ ok: boolean }>("/api/me/push", {
    method: "POST",
    json: subscription,
  });

export const unsubscribePush = (endpoint: string) =>
  req<{ ok: boolean }>("/api/me/push", {
    method: "DELETE",
    json: { endpoint },
  });

/** Récupère le média authentifié et renvoie une object URL (à révoquer). */
export async function fetchMediaObjectUrl(
  spaceId: string,
  mediaId: string,
): Promise<string> {
  const res = await fetch(`${BASE}/api/spaces/${spaceId}/media/${mediaId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError(res.status, "média indisponible");
  return URL.createObjectURL(await res.blob());
}
