import type { ChallengeStatus, Intensity, Verdict } from "../domain/types";
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
  Page,
  SeenEntry,
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
    /** Code machine stable renvoyé par l'API (API-15), ex. "not_found". */
    public code?: string,
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

export interface ClientLogEntry {
  level?: string;
  message: string;
  context?: string;
}

/**
 * Remonte un lot de logs front vers le serveur (best-effort, `keepalive` pour
 * survivre à une fermeture d'onglet). No-op sans jeton (la route exige l'auth).
 * On n'attend pas la réponse et on avale les erreurs — surtout pas de boucle.
 */
export function reportClientLogs(entries: ClientLogEntry[]): void {
  if (!token || entries.length === 0) return;
  void fetch(`${BASE}/api/logs`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ entries, userAgent: navigator.userAgent }),
    keepalive: true,
  }).catch(() => {});
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
    const body = await res
      .json()
      .then((b: { error?: string; code?: string }) => b)
      .catch(() => undefined);
    throw new ApiError(res.status, body?.error ?? res.statusText, body?.code);
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

/** Construit `?before=<iso>` pour les listes paginées (vide si pas de curseur). */
function pageQuery(before?: string): string {
  return before ? `?before=${encodeURIComponent(before)}` : "";
}

// ---------- Auth ----------

export const register = (
  email: string,
  displayName: string,
  password: string,
) =>
  req<AuthResponse>("/api/auth/register", {
    method: "POST",
    json: { email, displayName, password },
  });

export const login = (email: string, password: string) =>
  req<AuthResponse>("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });

export const me = () => req<UserPublic>("/api/auth/me");

/** Échange le code éphémère du callback OIDC contre le JWT de session. */
export const oidcExchange = (code: string) =>
  req<{ token: string }>("/api/auth/oidc/exchange", {
    method: "POST",
    json: { code },
  });

/** Révoque tous les jetons du compte (perte/vol d'appareil). 204 No Content. */
export const logoutAll = () =>
  req<void>("/api/auth/logout-all", { method: "POST" });

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

/** Met à jour le salon (nom et/ou fuseau). Tout membre peut l'éditer. */
export const updateSpace = (
  spaceId: string,
  body: {
    name?: string;
    timezone?: string;
    reactions?: string[];
    allowCustomReactions?: boolean;
    blindMood?: boolean;
    allowMediaDownload?: boolean;
  },
) => req<Space>(`/api/spaces/${spaceId}`, { method: "PATCH", json: body });

/** Génère un token d'invitation à usage unique (valable 7 jours) pour ce salon. */
export const createInvite = (spaceId: string) =>
  req<{ token: string }>(`/api/spaces/${spaceId}/invites`, { method: "POST" });

/** Rejoint un salon via un token d'invitation (SEC-005). */
export const joinByInvite = (token: string) =>
  req<Space>("/api/spaces/join", { method: "POST", json: { token } });

export const members = (spaceId: string) =>
  req<Member[]>(`/api/spaces/${spaceId}/members`);

// ---------- Mood ----------

export const setMood = (spaceId: string, status: string) =>
  req<MoodEntry>(`/api/spaces/${spaceId}/moods/me`, {
    method: "PUT",
    json: { status },
  });

export const listMoods = (spaceId: string) =>
  req<MoodEntry[]>(`/api/spaces/${spaceId}/moods`);

/** Retire mon humeur du jour (désélection). */
export const clearMood = (spaceId: string) =>
  req<void>(`/api/spaces/${spaceId}/moods/me`, { method: "DELETE" });

// ---------- Posts ----------

/** Liste paginée (curseur `before` = createdAt du plus ancien déjà chargé). */
export const listPosts = (spaceId: string, before?: string) =>
  req<Page<ApiPost>>(`/api/spaces/${spaceId}/posts${pageQuery(before)}`);

export const createPost = (
  spaceId: string,
  body: {
    title?: string;
    body: string;
    mediaId?: string;
    draft?: boolean;
    /** Média téléchargeable (#78). Absent ⇒ défaut du salon. */
    allowDownload?: boolean;
  },
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
    /** Change l'autorisation de téléchargement du média (#78). */
    allowDownload?: boolean;
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

/** Commentaires paginés (les plus récents d'abord ; `before` remonte le fil). */
export const listComments = (spaceId: string, postId: string, before?: string) =>
  req<Page<ApiComment>>(
    `/api/spaces/${spaceId}/posts/${postId}/comments${pageQuery(before)}`,
  );

export const addComment = (spaceId: string, postId: string, body: string) =>
  req<ApiComment>(`/api/spaces/${spaceId}/posts/${postId}/comments`, {
    method: "POST",
    json: { body },
  });

export const updateComment = (
  spaceId: string,
  postId: string,
  commentId: string,
  body: string,
) =>
  req<ApiComment>(
    `/api/spaces/${spaceId}/posts/${postId}/comments/${commentId}`,
    { method: "PATCH", json: { body } },
  );

export const deleteComment = (
  spaceId: string,
  postId: string,
  commentId: string,
) =>
  req<void>(
    `/api/spaces/${spaceId}/posts/${postId}/comments/${commentId}`,
    { method: "DELETE" },
  );

// ---------- Défis ----------

export const listChallenges = (spaceId: string, before?: string) =>
  req<Page<ApiChallenge>>(
    `/api/spaces/${spaceId}/challenges${pageQuery(before)}`,
  );

/** Banque de propositions (globales + propres au salon), dans la langue donnée. */
export const listChallengeSuggestions = (spaceId: string, lang: string) =>
  req<ChallengeSuggestion[]>(
    `/api/spaces/${spaceId}/suggestions?lang=${encodeURIComponent(lang)}`,
  );

type SuggestionInput = {
  title: string;
  description: string;
  intensity: Intensity;
  locale: string;
};

/** Ajoute une proposition propre au salon. */
export const createSuggestion = (spaceId: string, body: SuggestionInput) =>
  req<ChallengeSuggestion>(`/api/spaces/${spaceId}/suggestions`, {
    method: "POST",
    json: body,
  });

/** Édite une proposition du salon. */
export const updateSuggestion = (
  spaceId: string,
  sid: string,
  body: SuggestionInput,
) =>
  req<ChallengeSuggestion>(
    `/api/spaces/${spaceId}/suggestions/${sid}`,
    { method: "PATCH", json: body },
  );

/** Supprime une proposition du salon. */
export const deleteSuggestion = (spaceId: string, sid: string) =>
  req<void>(`/api/spaces/${spaceId}/suggestions/${sid}`, {
    method: "DELETE",
  });

/** Masque (#70) ou réaffiche une suggestion pour ce salon. */
export const setSuggestionHidden = (
  spaceId: string,
  sid: string,
  hidden: boolean,
) =>
  req<void>(`/api/spaces/${spaceId}/suggestions/${sid}/hidden`, {
    method: "PUT",
    json: { hidden },
  });

export const createChallenge = (
  spaceId: string,
  body: {
    title: string;
    description: string;
    intensity: Intensity;
    deadlineLabel?: string;
    /** Suggestion de la banque dont ce défi est issu (#69). */
    sourceSuggestionId?: string;
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
    `/api/spaces/${spaceId}/challenges/${challengeId}/transitions`,
    { method: "POST", json: { to: status } },
  );

export const updateChallenge = (
  spaceId: string,
  challengeId: string,
  body: {
    title: string;
    description: string;
    intensity: Intensity;
    deadlineLabel?: string;
  },
) =>
  req<ApiChallenge>(`/api/spaces/${spaceId}/challenges/${challengeId}`, {
    method: "PATCH",
    json: body,
  });

export const deleteChallenge = (spaceId: string, challengeId: string) =>
  req<void>(`/api/spaces/${spaceId}/challenges/${challengeId}`, {
    method: "DELETE",
  });

// ---------- "Vu" (badges + accusés de lecture) ----------

export const listSeen = (spaceId: string) =>
  req<SeenEntry[]>(`/api/spaces/${spaceId}/seen`);

export const markSeen = (spaceId: string, feature: "blog" | "challenges") =>
  req<SeenEntry>(`/api/spaces/${spaceId}/seen/${feature}`, { method: "PUT" });

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
  req<void>("/api/me/push", { method: "POST", json: subscription });

export const unsubscribePush = (endpoint: string) =>
  req<void>(`/api/me/push?endpoint=${encodeURIComponent(endpoint)}`, {
    method: "DELETE",
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
