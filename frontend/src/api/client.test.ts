import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonRes(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: "Status text",
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob(["x"])),
  } as unknown as Response;
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonRes({}));
  vi.stubGlobal("fetch", fetchMock);
  api.setToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Dernier appel fetch : [url, init]. */
function lastCall() {
  const calls = fetchMock.mock.calls;
  const [url, init] = calls[calls.length - 1] as [string, RequestInit];
  return { url, init };
}

describe("ApiError", () => {
  it("porte statut, message et code", () => {
    const e = new api.ApiError(404, "introuvable", "not_found");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ApiError");
    expect(e.status).toBe(404);
    expect(e.code).toBe("not_found");
  });
});

describe("req (via les wrappers)", () => {
  it("envoie le jeton Bearer quand il est défini", async () => {
    api.setToken("abc");
    await api.me();
    const { init } = lastCall();
    expect(init.headers).toMatchObject({ Authorization: "Bearer abc" });
  });

  it("n'envoie pas d'Authorization sans jeton", async () => {
    await api.me();
    expect(lastCall().init.headers).not.toHaveProperty("Authorization");
  });

  it("sérialise le corps JSON avec le Content-Type", async () => {
    await api.login("a@b.c", "pw");
    const { url, init } = lastCall();
    expect(url.endsWith("/api/auth/login")).toBe(true);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@b.c",
      password: "pw",
    });
  });

  it("renvoie undefined sur 204", async () => {
    fetchMock.mockResolvedValue(jsonRes(null, { status: 204 }));
    await expect(api.logoutAll()).resolves.toBeUndefined();
  });

  it("lève une ApiError avec le message/code du corps", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ error: "interdit", code: "forbidden" }, { status: 403 }),
    );
    await expect(api.me()).rejects.toMatchObject({
      status: 403,
      message: "interdit",
      code: "forbidden",
    });
  });

  it("retombe sur statusText si le corps d'erreur n'est pas du JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: () => Promise.reject(new Error("pas du json")),
    } as unknown as Response);
    await expect(api.me()).rejects.toMatchObject({
      status: 500,
      message: "Server Error",
      code: undefined,
    });
  });
});

describe("withRetry (getAuthConfig / getApiVersion)", () => {
  it("réessaie après un échec transitoire puis réussit", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValueOnce(jsonRes({ passwordEnabled: true }));
    const p = api.getAuthConfig();
    await vi.advanceTimersByTimeAsync(300);
    await expect(p).resolves.toEqual({ passwordEnabled: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("abandonne après 3 tentatives et relance la dernière erreur", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("down"));
    const p = api.getApiVersion();
    const assertion = expect(p).rejects.toThrow("down");
    await vi.advanceTimersByTimeAsync(300 + 600);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("URLs et verbes des endpoints", () => {
  const S = "space1";
  const cases: Array<[string, () => Promise<unknown>, string, string]> = [
    ["register", () => api.register("e", "n", "p"), "POST", "/api/auth/register"],
    ["updateMe", () => api.updateMe("N"), "PATCH", "/api/auth/me"],
    ["oidcExchange", () => api.oidcExchange("c"), "POST", "/api/auth/oidc/exchange"],
    ["createSpace", () => api.createSpace("n"), "POST", "/api/spaces"],
    ["mySpaces", () => api.mySpaces(), "GET", "/api/spaces/me"],
    ["updateSpace", () => api.updateSpace(S, { name: "x" }), "PATCH", `/api/spaces/${S}`],
    ["listLoveNotes", () => api.listLoveNotes(S), "GET", `/api/spaces/${S}/love-notes`],
    ["createLoveNote", () => api.createLoveNote(S, { body: "b" }), "POST", `/api/spaces/${S}/love-notes`],
    ["deleteLoveNote", () => api.deleteLoveNote(S, "n1"), "DELETE", `/api/spaces/${S}/love-notes/n1`],
    ["createInvite", () => api.createInvite(S), "POST", `/api/spaces/${S}/invites`],
    ["joinByInvite", () => api.joinByInvite("code"), "POST", "/api/spaces/join"],
    ["members", () => api.members(S), "GET", `/api/spaces/${S}/members`],
    ["setMood", () => api.setMood(S, "hot"), "PUT", `/api/spaces/${S}/moods/me`],
    ["listMoods", () => api.listMoods(S), "GET", `/api/spaces/${S}/moods`],
    ["clearMood", () => api.clearMood(S), "DELETE", `/api/spaces/${S}/moods/me`],
    ["createPost", () => api.createPost(S, { body: "b" }), "POST", `/api/spaces/${S}/posts`],
    ["deletePost", () => api.deletePost(S, "p1"), "DELETE", `/api/spaces/${S}/posts/p1`],
    ["updatePost", () => api.updatePost(S, "p1", { title: "t" }), "PATCH", `/api/spaces/${S}/posts/p1`],
    ["publishPost", () => api.publishPost(S, "p1"), "PATCH", `/api/spaces/${S}/posts/p1`],
    ["addReaction", () => api.addReaction(S, "p1", "🔥"), "POST", `/api/spaces/${S}/posts/p1/reactions`],
    ["setVerdict", () => api.setVerdict(S, "p1", "love" as never), "PUT", `/api/spaces/${S}/posts/p1/verdict`],
    ["setFavorite", () => api.setFavorite(S, "p1"), "PUT", `/api/spaces/${S}/posts/p1/favorite`],
    ["unsetFavorite", () => api.unsetFavorite(S, "p1"), "DELETE", `/api/spaces/${S}/posts/p1/favorite`],
    ["addComment", () => api.addComment(S, "p1", "c"), "POST", `/api/spaces/${S}/posts/p1/comments`],
    ["updateComment", () => api.updateComment(S, "p1", "c1", "c"), "PATCH", `/api/spaces/${S}/posts/p1/comments/c1`],
    ["deleteComment", () => api.deleteComment(S, "p1", "c1"), "DELETE", `/api/spaces/${S}/posts/p1/comments/c1`],
    ["createSuggestion", () => api.createSuggestion(S, { title: "t", description: "d", intensity: "hot" as never, locale: "fr" }), "POST", `/api/spaces/${S}/suggestions`],
    ["updateSuggestion", () => api.updateSuggestion(S, "s1", { title: "t", description: "d", intensity: "hot" as never, locale: "fr" }), "PATCH", `/api/spaces/${S}/suggestions/s1`],
    ["deleteSuggestion", () => api.deleteSuggestion(S, "s1"), "DELETE", `/api/spaces/${S}/suggestions/s1`],
    ["setSuggestionHidden", () => api.setSuggestionHidden(S, "s1", true), "PUT", `/api/spaces/${S}/suggestions/s1/hidden`],
    ["createChallenge", () => api.createChallenge(S, { title: "t", description: "d", intensity: "hot" as never }), "POST", `/api/spaces/${S}/challenges`],
    ["transitionChallenge", () => api.transitionChallenge(S, "c1", "jobDone" as never), "POST", `/api/spaces/${S}/challenges/c1/transitions`],
    ["updateChallenge", () => api.updateChallenge(S, "c1", { title: "t", description: "d", intensity: "hot" as never }), "PATCH", `/api/spaces/${S}/challenges/c1`],
    ["deleteChallenge", () => api.deleteChallenge(S, "c1"), "DELETE", `/api/spaces/${S}/challenges/c1`],
    ["listSeen", () => api.listSeen(S), "GET", `/api/spaces/${S}/seen`],
    ["markSeen", () => api.markSeen(S, "blog"), "PUT", `/api/spaces/${S}/seen/blog`],
    ["listNotices", () => api.listNotices(S), "GET", `/api/spaces/${S}/notices`],
    ["getSettings", () => api.getSettings(), "GET", "/api/me/settings"],
    ["updateSettings", () => api.updateSettings("push" as never), "PUT", "/api/me/settings"],
    ["getVapidKey", () => api.getVapidKey(), "GET", "/api/notifications/vapid"],
    ["subscribePush", () => api.subscribePush({ endpoint: "https://e" }), "POST", "/api/me/push"],
  ];

  it.each(cases)("%s → %s %s", async (_name, call, method, path) => {
    await call();
    const { url, init } = lastCall();
    expect(init.method ?? "GET").toBe(method);
    expect(url.endsWith(path)).toBe(true);
  });

  it("pagine avec ?before= (encodé) et sans curseur", async () => {
    await api.listPosts(S);
    expect(lastCall().url.endsWith(`/api/spaces/${S}/posts`)).toBe(true);
    await api.listPosts(S, "2026-01-01T00:00:00+01:00");
    expect(lastCall().url).toContain(
      "?before=2026-01-01T00%3A00%3A00%2B01%3A00",
    );
    await api.listComments(S, "p1", "x y");
    expect(lastCall().url).toContain("/posts/p1/comments?before=x%20y");
    await api.listChallenges(S, "z");
    expect(lastCall().url).toContain(`/challenges?before=z`);
  });

  it("encode l'emoji dans removeReaction et la langue des suggestions", async () => {
    await api.removeReaction(S, "p1", "🔥");
    expect(lastCall().url).toContain(`/reactions/${encodeURIComponent("🔥")}`);
    expect(lastCall().init.method).toBe("DELETE");
    await api.listChallengeSuggestions(S, "fr-FR");
    expect(lastCall().url).toContain("/suggestions?lang=fr-FR");
  });

  it("encode l'endpoint dans unsubscribePush", async () => {
    await api.unsubscribePush("https://push/x?y=1");
    const { url, init } = lastCall();
    expect(url).toContain(`/api/me/push?endpoint=${encodeURIComponent("https://push/x?y=1")}`);
    expect(init.method).toBe("DELETE");
  });
});

describe("URLs utilitaires", () => {
  it("oidcLoginUrl pointe sur la route de login OIDC", () => {
    expect(api.oidcLoginUrl().endsWith("/api/auth/oidc/login")).toBe(true);
  });

  it("spaceSocketUrl passe en ws(s) et encode le jeton", () => {
    const url = api.spaceSocketUrl("sp", "a b+c");
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain("/api/spaces/sp/ws?token=a%20b%2Bc");
  });
});

describe("médias", () => {
  it("uploadMedia envoie un FormData avec viewOnce", async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: "m1" }));
    const file = new File(["x"], "a.png", { type: "image/png" });
    await expect(api.uploadMedia("sp", file, true)).resolves.toEqual({ id: "m1" });
    const { url, init } = lastCall();
    expect(url.endsWith("/api/spaces/sp/media")).toBe(true);
    const fd = init.body as FormData;
    expect(fd.get("viewOnce")).toBe("true");
    expect((fd.get("file") as File).name).toBe("a.png");
  });

  it("uploadMedia lève une ApiError sur échec", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, { status: 413 }));
    await expect(
      api.uploadMedia("sp", new File(["x"], "a.png"), false),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("fetchMediaObjectUrl renvoie une object URL", async () => {
    const create = vi.fn().mockReturnValue("blob:abc");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create }));
    await expect(api.fetchMediaObjectUrl("sp", "m1")).resolves.toBe("blob:abc");
    expect(lastCall().url.endsWith("/api/spaces/sp/media/m1")).toBe(true);
  });

  it("fetchMediaObjectUrl lève une ApiError si indisponible", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, { status: 404 }));
    await expect(api.fetchMediaObjectUrl("sp", "m1")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("reportClientLogs", () => {
  it("ne fait rien sans jeton ou sans entrées", () => {
    api.reportClientLogs([{ message: "x" }]);
    api.setToken("t");
    api.reportClientLogs([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("poste le lot en keepalive et avale les erreurs", async () => {
    api.setToken("t");
    fetchMock.mockRejectedValue(new Error("offline"));
    api.reportClientLogs([{ message: "boom", level: "error" }]);
    const { url, init } = lastCall();
    expect(url.endsWith("/api/logs")).toBe(true);
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string).entries).toEqual([
      { message: "boom", level: "error" },
    ]);
    await Promise.resolve();
  });
});
