import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as c from "./client";

const fetchMock = vi.fn();

function ok(body: unknown = {}, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
}
function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return {
    url,
    method: init.method ?? "GET",
    headers: (init.headers ?? {}) as Record<string, string>,
    body: init.body as string | FormData | undefined,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok({}));
  vi.stubGlobal("fetch", fetchMock);
  c.setToken(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("req : en-têtes, corps et erreurs", () => {
  it("sans jeton : pas d'Authorization ; avec jeton : Bearer", async () => {
    await c.me();
    expect(lastCall().headers.Authorization).toBeUndefined();
    c.setToken("tok");
    await c.me();
    expect(lastCall().headers.Authorization).toBe("Bearer tok");
  });

  it("envoie le JSON avec Content-Type, et pas de Content-Type sans corps", async () => {
    await c.login("a@x.test", "pw");
    const call = lastCall();
    expect(call.method).toBe("POST");
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(call.body as string)).toEqual({ email: "a@x.test", password: "pw" });
    await c.me();
    expect(lastCall().headers["Content-Type"]).toBeUndefined();
  });

  it("204 : renvoie undefined sans parser de corps", async () => {
    fetchMock.mockResolvedValue(ok(null, 204));
    await expect(c.logoutAll()).resolves.toBeUndefined();
  });

  it("erreur HTTP : ApiError avec statut, message et code de l'API", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "introuvable", code: "not_found" }), { status: 404 }),
    );
    const err = await c.me().catch((e) => e);
    expect(err).toBeInstanceOf(c.ApiError);
    expect(err).toMatchObject({ status: 404, message: "introuvable", code: "not_found", name: "ApiError" });
  });

  it("erreur HTTP sans corps JSON : retombe sur le statusText", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    const err = await c.me().catch((e) => e);
    expect(err).toMatchObject({ status: 502, message: "Bad Gateway", code: undefined });
  });
});

describe("withRetry (config d'auth et version publiques)", () => {
  it("réessaie après un échec réseau puis réussit", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new Error("réseau"));
    fetchMock.mockResolvedValueOnce(ok({ passwordEnabled: true, oidcEnabled: false }));
    const p = c.getAuthConfig();
    await vi.advanceTimersByTimeAsync(400);
    await expect(p).resolves.toEqual({ passwordEnabled: true, oidcEnabled: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("abandonne après 3 tentatives et remonte la dernière erreur", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("panne"));
    const p = c.getApiVersion().catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toMatchObject({ message: "panne" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

// Chaque appel : [fonction, méthode, fin de l'URL, corps JSON attendu (ou undefined)].
const S = "s1";
const CASES: [string, () => Promise<unknown>, string, string, unknown][] = [
  ["register", () => c.register("a@x", "Al", "pw"), "POST", "/api/auth/register", { email: "a@x", displayName: "Al", password: "pw" }],
  ["updateMe", () => c.updateMe("Al"), "PATCH", "/api/auth/me", { displayName: "Al" }],
  ["oidcExchange", () => c.oidcExchange("code"), "POST", "/api/auth/oidc/exchange", { code: "code" }],
  ["logoutAll", () => c.logoutAll(), "POST", "/api/auth/logout-all", undefined],
  ["createSpace", () => c.createSpace("Salon"), "POST", "/api/spaces", { name: "Salon" }],
  ["mySpaces", () => c.mySpaces(), "GET", "/api/spaces/me", undefined],
  ["updateSpace", () => c.updateSpace(S, { name: "N", blindMood: true }), "PATCH", `/api/spaces/${S}`, { name: "N", blindMood: true }],
  ["listDesires", () => c.listDesires(S), "GET", `/api/spaces/${S}/desires`, undefined],
  ["setDesireStance", () => c.setDesireStance(S, "d1", "want"), "PUT", `/api/spaces/${S}/desires/d1/stance`, { stance: "want" }],
  ["clearDesireStance", () => c.clearDesireStance(S, "d1"), "DELETE", `/api/spaces/${S}/desires/d1/stance`, undefined],
  ["setDesireDone", () => c.setDesireDone(S, "d1"), "PUT", `/api/spaces/${S}/desires/d1/done`, undefined],
  ["unsetDesireDone", () => c.unsetDesireDone(S, "d1"), "DELETE", `/api/spaces/${S}/desires/d1/done`, undefined],
  ["listEveningMenu", () => c.listEveningMenu(S), "GET", `/api/spaces/${S}/evening-menu`, undefined],
  ["pickEveningMenu défaut", () => c.pickEveningMenu(S, "m1"), "PUT", `/api/spaces/${S}/evening-menu/m1`, { stance: "want" }],
  ["pickEveningMenu service", () => c.pickEveningMenu(S, "m1", "refused", "main"), "PUT", `/api/spaces/${S}/evening-menu/m1`, { stance: "refused", course: "main" }],
  ["getEveningMenuStatus", () => c.getEveningMenuStatus(S), "GET", `/api/spaces/${S}/evening-menu-status`, undefined],
  ["setEveningMenuDone(true)", () => c.setEveningMenuDone(S, true), "PUT", `/api/spaces/${S}/evening-menu-done`, undefined],
  ["setEveningMenuDone(false)", () => c.setEveningMenuDone(S, false), "DELETE", `/api/spaces/${S}/evening-menu-done`, undefined],
  ["unpickEveningMenu", () => c.unpickEveningMenu(S, "m1"), "DELETE", `/api/spaces/${S}/evening-menu/m1`, undefined],
  ["listLoveNotes", () => c.listLoveNotes(S), "GET", `/api/spaces/${S}/love-notes`, undefined],
  ["createLoveNote", () => c.createLoveNote(S, { body: "hello", openAt: "2030-01-01T00:00:00Z" }), "POST", `/api/spaces/${S}/love-notes`, { body: "hello", openAt: "2030-01-01T00:00:00Z" }],
  ["deleteLoveNote", () => c.deleteLoveNote(S, "n1"), "DELETE", `/api/spaces/${S}/love-notes/n1`, undefined],
  ["createInvite", () => c.createInvite(S), "POST", `/api/spaces/${S}/invites`, undefined],
  ["joinByInvite", () => c.joinByInvite("CODE#1"), "POST", "/api/spaces/join", { code: "CODE#1" }],
  ["members", () => c.members(S), "GET", `/api/spaces/${S}/members`, undefined],
  ["setMood", () => c.setMood(S, "calm"), "PUT", `/api/spaces/${S}/moods/me`, { status: "calm" }],
  ["listMoods", () => c.listMoods(S), "GET", `/api/spaces/${S}/moods`, undefined],
  ["clearMood", () => c.clearMood(S), "DELETE", `/api/spaces/${S}/moods/me`, undefined],
  ["listPosts", () => c.listPosts(S), "GET", `/api/spaces/${S}/posts`, undefined],
  ["listPosts curseur", () => c.listPosts(S, "2026-01-01T10:00:00+00:00"), "GET", `/api/spaces/${S}/posts?before=2026-01-01T10%3A00%3A00%2B00%3A00`, undefined],
  ["createPost", () => c.createPost(S, { body: "x", mediaIds: ["m"], draft: true }), "POST", `/api/spaces/${S}/posts`, { body: "x", mediaIds: ["m"], draft: true }],
  ["deletePost", () => c.deletePost(S, "p1"), "DELETE", `/api/spaces/${S}/posts/p1`, undefined],
  ["updatePost", () => c.updatePost(S, "p1", { title: "T" }), "PATCH", `/api/spaces/${S}/posts/p1`, { title: "T" }],
  ["publishPost", () => c.publishPost(S, "p1"), "PATCH", `/api/spaces/${S}/posts/p1`, { draft: false }],
  ["addReaction", () => c.addReaction(S, "p1", "heart"), "POST", `/api/spaces/${S}/posts/p1/reactions`, { reaction: "heart" }],
  ["removeReaction (emoji encodé)", () => c.removeReaction(S, "p1", "🔥"), "DELETE", `/api/spaces/${S}/posts/p1/reactions/${encodeURIComponent("🔥")}`, undefined],
  ["setVerdict", () => c.setVerdict(S, "p1", "hot"), "PUT", `/api/spaces/${S}/posts/p1/verdict`, { verdict: "hot" }],
  ["setFavorite", () => c.setFavorite(S, "p1"), "PUT", `/api/spaces/${S}/posts/p1/favorite`, undefined],
  ["unsetFavorite", () => c.unsetFavorite(S, "p1"), "DELETE", `/api/spaces/${S}/posts/p1/favorite`, undefined],
  ["listComments", () => c.listComments(S, "p1", "2026-01-01T00:00:00Z"), "GET", `/api/spaces/${S}/posts/p1/comments?before=2026-01-01T00%3A00%3A00Z`, undefined],
  ["addComment", () => c.addComment(S, "p1", "yo"), "POST", `/api/spaces/${S}/posts/p1/comments`, { body: "yo" }],
  ["updateComment", () => c.updateComment(S, "p1", "c1", "yo2"), "PATCH", `/api/spaces/${S}/posts/p1/comments/c1`, { body: "yo2" }],
  ["deleteComment", () => c.deleteComment(S, "p1", "c1"), "DELETE", `/api/spaces/${S}/posts/p1/comments/c1`, undefined],
  ["listChallenges", () => c.listChallenges(S), "GET", `/api/spaces/${S}/challenges`, undefined],
  ["listChallengeSuggestions", () => c.listChallengeSuggestions(S, "en"), "GET", `/api/spaces/${S}/suggestions?lang=en`, undefined],
  ["createSuggestion", () => c.createSuggestion(S, { title: "t", description: "", intensity: "soft", locale: "fr" }), "POST", `/api/spaces/${S}/suggestions`, { title: "t", description: "", intensity: "soft", locale: "fr" }],
  ["updateSuggestion", () => c.updateSuggestion(S, "g1", { title: "t", description: "", intensity: "hot", locale: "fr" }), "PATCH", `/api/spaces/${S}/suggestions/g1`, { title: "t", description: "", intensity: "hot", locale: "fr" }],
  ["deleteSuggestion", () => c.deleteSuggestion(S, "g1"), "DELETE", `/api/spaces/${S}/suggestions/g1`, undefined],
  ["setSuggestionHidden", () => c.setSuggestionHidden(S, "g1", true), "PUT", `/api/spaces/${S}/suggestions/g1/hidden`, { hidden: true }],
  ["createChallenge", () => c.createChallenge(S, { title: "t", description: "d", intensity: "soft" }), "POST", `/api/spaces/${S}/challenges`, { title: "t", description: "d", intensity: "soft" }],
  ["transitionChallenge", () => c.transitionChallenge(S, "h1", "jobDone"), "POST", `/api/spaces/${S}/challenges/h1/transitions`, { to: "jobDone" }],
  ["updateChallenge", () => c.updateChallenge(S, "h1", { title: "t", description: "d", intensity: "hot" }), "PATCH", `/api/spaces/${S}/challenges/h1`, { title: "t", description: "d", intensity: "hot" }],
  ["deleteChallenge", () => c.deleteChallenge(S, "h1"), "DELETE", `/api/spaces/${S}/challenges/h1`, undefined],
  ["listSeen", () => c.listSeen(S), "GET", `/api/spaces/${S}/seen`, undefined],
  ["markSeen", () => c.markSeen(S, "blog"), "PUT", `/api/spaces/${S}/seen/blog`, undefined],
  ["listNotices", () => c.listNotices(S), "GET", `/api/spaces/${S}/notices`, undefined],
  ["listNotifications", () => c.listNotifications(S), "GET", `/api/spaces/${S}/notifications`, undefined],
  ["unreadNotificationCount", () => c.unreadNotificationCount(S), "GET", `/api/spaces/${S}/notifications/unread-count`, undefined],
  ["markNotificationRead", () => c.markNotificationRead(S, "n1"), "PUT", `/api/spaces/${S}/notifications/n1/read`, undefined],
  ["markAllNotificationsRead", () => c.markAllNotificationsRead(S), "PUT", `/api/spaces/${S}/notifications/read-all`, undefined],
  ["getSettings", () => c.getSettings(), "GET", "/api/me/settings", undefined],
  ["updateSettings", () => c.updateSettings("push"), "PUT", "/api/me/settings", { notifMode: "push" }],
  ["getVapidKey", () => c.getVapidKey(), "GET", "/api/notifications/vapid", undefined],
  ["subscribePush", () => c.subscribePush({ endpoint: "https://p/e" }), "POST", "/api/me/push", { endpoint: "https://p/e" }],
  ["unsubscribePush (endpoint en query)", () => c.unsubscribePush("https://p/e?x=1"), "DELETE", `/api/me/push?endpoint=${encodeURIComponent("https://p/e?x=1")}`, undefined],
];

describe("routes de l'API : méthode, URL et corps", () => {
  it.each(CASES)("%s", async (_name, call, method, path, body) => {
    await call();
    const got = lastCall();
    expect(got.method).toBe(method);
    expect(got.url.endsWith(path)).toBe(true);
    if (body === undefined) expect(got.body).toBeUndefined();
    else expect(JSON.parse(got.body as string)).toEqual(body);
  });
});

describe("utilitaires", () => {
  it("oidcLoginUrl pointe sur la route de login OIDC", () => {
    expect(c.oidcLoginUrl().endsWith("/api/auth/oidc/login")).toBe(true);
  });

  it("spaceSocketUrl : ws(s), salon, jeton encodé", () => {
    const url = c.spaceSocketUrl("s1", "a b/c");
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain("/api/spaces/s1/ws?token=a%20b%2Fc");
  });

  it("reportClientLogs : no-op sans jeton ou sans entrée ; sinon POST keepalive", () => {
    c.reportClientLogs([{ message: "x" }]);
    expect(fetchMock).not.toHaveBeenCalled();
    c.setToken("tok");
    c.reportClientLogs([]);
    expect(fetchMock).not.toHaveBeenCalled();
    c.reportClientLogs([{ level: "error", message: "boom", context: "ctx" }]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/logs$/);
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string).entries).toHaveLength(1);
  });

  it("reportClientLogs avale une erreur réseau (jamais de boucle)", async () => {
    c.setToken("tok");
    fetchMock.mockRejectedValue(new Error("hors ligne"));
    expect(() => c.reportClientLogs([{ message: "x" }])).not.toThrow();
    await Promise.resolve();
  });
});

describe("médias", () => {
  it("uploadMedia : multipart avec le fichier et viewOnce, jeton en en-tête", async () => {
    c.setToken("tok");
    fetchMock.mockResolvedValue(ok({ id: "m1", mime: "image/jpeg", viewOnce: true }));
    const file = new File(["abc"], "x.jpg", { type: "image/jpeg" });
    const res = await c.uploadMedia("s1", file, true);
    expect(res.id).toBe("m1");
    const call = lastCall();
    expect(call.url.endsWith("/api/spaces/s1/media")).toBe(true);
    expect(call.headers.Authorization).toBe("Bearer tok");
    const fd = call.body as FormData;
    expect((fd.get("file") as File).name).toBe("x.jpg");
    expect(fd.get("viewOnce")).toBe("true");
  });

  it("uploadMedia : échec HTTP → ApiError", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 413 }));
    await expect(c.uploadMedia("s1", new File(["a"], "a"), false)).rejects.toMatchObject({ status: 413 });
  });

  it("fetchMediaObjectUrl : renvoie une object URL du blob", async () => {
    const create = vi.fn().mockReturnValue("blob:xyz");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create }));
    c.setToken("tok");
    fetchMock.mockResolvedValue(new Response(new Blob(["img"]), { status: 200 }));
    await expect(c.fetchMediaObjectUrl("s1", "m1")).resolves.toBe("blob:xyz");
    expect(lastCall().url.endsWith("/api/spaces/s1/media/m1")).toBe(true);
    expect(lastCall().headers.Authorization).toBe("Bearer tok");
  });

  it("fetchMediaObjectUrl : média indisponible → ApiError", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    await expect(c.fetchMediaObjectUrl("s1", "m1")).rejects.toMatchObject({ status: 404 });
  });
});
