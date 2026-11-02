import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function load(search: string) {
  vi.resetModules();
  window.history.replaceState(null, "", `/${search}#frag`);
  return import("./share");
}
const fetchMock = vi.fn();
const cachesDelete = vi.fn().mockResolvedValue(true);

beforeEach(() => {
  fetchMock.mockReset();
  cachesDelete.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("caches", { delete: cachesDelete });
});
afterEach(() => vi.unstubAllGlobals());

const res = (body: BodyInit | null, init: ResponseInit & { headers?: Record<string, string> } = {}) =>
  new Response(body, init);

describe("share target", () => {
  it("sans drapeau ?share-target : aucun fichier, aucun appel réseau", async () => {
    const { takeSharedFiles } = await load("");
    expect(await takeSharedFiles()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("récupère les fichiers du SW une seule fois, nettoie l'URL et le cache", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/__shared-media") return res(JSON.stringify({ count: 2 }));
      if (url === "/__shared-media/0")
        return res("AAA", { headers: { "X-Share-Filename": "photo%20un.jpg", "Content-Type": "image/jpeg" } });
      return res("BBB", { headers: { "Content-Type": "video/mp4" } });
    });
    const { takeSharedFiles } = await load("?share-target=1");
    expect(window.location.search).toBe(""); // drapeau effacé
    expect(window.location.hash).toBe("#frag");

    const files = await takeSharedFiles();
    expect(files.map((f) => f.name)).toEqual(["photo un.jpg", "media"]);
    expect(files[0].type).toBe("image/jpeg");
    expect(cachesDelete).toHaveBeenCalledWith("pp-share");
    expect(await takeSharedFiles()).toEqual([]); // consommé une fois
  });

  it("ignore les fichiers vides ou en erreur", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/__shared-media") return res(JSON.stringify({ count: 3 }));
      if (url.endsWith("/0")) return res("", { status: 200 }); // vide
      if (url.endsWith("/1")) return res("x", { status: 500 });
      throw new Error("réseau");
    });
    const { takeSharedFiles } = await load("?share-target=1");
    expect(await takeSharedFiles()).toEqual([]);
  });

  it("manifeste absent, invalide ou réseau en panne : liste vide sans erreur", async () => {
    fetchMock.mockResolvedValue(res("", { status: 404 }));
    let m = await load("?share-target=1");
    expect(await m.takeSharedFiles()).toEqual([]);

    fetchMock.mockResolvedValue(res(JSON.stringify({})));
    m = await load("?share-target=1");
    expect(await m.takeSharedFiles()).toEqual([]);

    fetchMock.mockRejectedValue(new Error("réseau"));
    m = await load("?share-target=1");
    expect(await m.takeSharedFiles()).toEqual([]);
  });
});
