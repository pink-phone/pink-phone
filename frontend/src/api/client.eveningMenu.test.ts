import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApiError,
  getEveningMenuStatus,
  listEveningMenu,
  pickEveningMenu,
  setEveningMenuDone,
  setToken,
  unpickEveningMenu,
  updateSpace,
} from "./client";

// Contrats HTTP du menu du soir : méthode, chemin, corps, jeton.
const fetchMock = vi.fn();

function ok(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setToken("tok");
});

const last = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit };
};

describe("client — menu du soir", () => {
  it("listEveningMenu / getEveningMenuStatus : GET authentifiés", async () => {
    fetchMock.mockImplementation(() => ok([]));
    await listEveningMenu("s1");
    expect(last().url).toMatch(/\/api\/spaces\/s1\/evening-menu$/);
    expect((last().init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    fetchMock.mockImplementation(() => ok({ meDone: false }));
    await getEveningMenuStatus("s1");
    expect(last().url).toMatch(/\/api\/spaces\/s1\/evening-menu-status$/);
    expect(last().init.method).toBe("GET");
  });

  it("pickEveningMenu : stance par défaut « want », service transmis seulement s'il est donné", async () => {
    fetchMock.mockImplementation(() => ok({}));
    await pickEveningMenu("s1", "evening-massage");
    expect(last().init.method).toBe("PUT");
    expect(JSON.parse(String(last().init.body))).toEqual({ stance: "want" });
    await pickEveningMenu("s1", "evening-massage", "want", "dessert");
    expect(JSON.parse(String(last().init.body))).toEqual({ stance: "want", course: "dessert" });
    await pickEveningMenu("s1", "evening-massage", "refused");
    expect(JSON.parse(String(last().init.body))).toEqual({ stance: "refused" });
  });

  it("unpickEveningMenu : DELETE sur le code", async () => {
    fetchMock.mockImplementation(() => ok({}));
    await unpickEveningMenu("s1", "evening-massage");
    expect(last().init.method).toBe("DELETE");
    expect(last().url).toMatch(/\/evening-menu\/evening-massage$/);
  });

  it("setEveningMenuDone : PUT pour valider, DELETE pour rouvrir", async () => {
    fetchMock.mockImplementation(() => ok({}));
    await setEveningMenuDone("s1", true);
    expect(last().init.method).toBe("PUT");
    expect(last().url).toMatch(/\/evening-menu-done$/);
    await setEveningMenuDone("s1", false);
    expect(last().init.method).toBe("DELETE");
  });

  it("updateSpace : classement des services (custom + entrées « service:categorie »)", async () => {
    fetchMock.mockImplementation(() => ok({}));
    await updateSpace("s1", {
      eveningCourseCustom: true,
      eveningCourseCategories: ["main:tender"],
    });
    expect(last().init.method).toBe("PATCH");
    expect(JSON.parse(String(last().init.body))).toEqual({
      eveningCourseCustom: true,
      eveningCourseCategories: ["main:tender"],
    });
  });

  it("erreur HTTP : ApiError avec le statut (ex. 409 menu validé)", async () => {
    fetchMock.mockReturnValue(
      Promise.resolve(
        new Response(JSON.stringify({ error: "menu du soir déjà validé", code: "conflict" }), {
          status: 409,
        }),
      ),
    );
    await expect(pickEveningMenu("s1", "x")).rejects.toMatchObject({
      status: 409,
      code: "conflict",
    });
    await expect(pickEveningMenu("s1", "x")).rejects.toBeInstanceOf(ApiError);
  });
});
