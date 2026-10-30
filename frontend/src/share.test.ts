import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function res(body: string | null, init: { ok?: boolean; headers?: Record<string, string> } = {}) {
  return {
    ok: init.ok ?? true,
    headers: new Headers(init.headers),
    json: () => Promise.resolve(JSON.parse(String(body))),
    blob: () => Promise.resolve(new Blob(body ? [body] : [])),
  } as unknown as Response;
}

async function loadWithShare() {
  window.history.replaceState(null, "", "/?share-target=1#h");
  vi.resetModules();
  return import("./share");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("share target", () => {
  it("sans drapeau : aucun fichier et pas de fetch", async () => {
    window.history.replaceState(null, "", "/");
    vi.resetModules();
    const { takeSharedFiles } = await import("./share");
    await expect(takeSharedFiles()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("récupère les fichiers du SW, nettoie l'URL, ne sert qu'une fois", async () => {
    fetchMock.mockImplementation((path: string) => {
      if (path === "/__shared-media") return Promise.resolve(res(JSON.stringify({ count: 2 })));
      if (path === "/__shared-media/0")
        return Promise.resolve(res("abc", { headers: { "X-Share-Filename": encodeURIComponent("é a.png") } }));
      return Promise.resolve(res("")); // 2e fichier vide → ignoré
    });
    const { takeSharedFiles } = await loadWithShare();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#h");
    const files = await takeSharedFiles();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("é a.png");
    await expect(takeSharedFiles()).resolves.toEqual([]);
  });

  it("nom par défaut 'media' sans en-tête", async () => {
    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/__shared-media" ? res(JSON.stringify({ count: 1 })) : res("x")),
    );
    const { takeSharedFiles } = await loadWithShare();
    expect((await takeSharedFiles())[0].name).toBe("media");
  });

  it("réponse non ok → liste vide", async () => {
    fetchMock.mockResolvedValue(res("{}", { ok: false }));
    const { takeSharedFiles } = await loadWithShare();
    await expect(takeSharedFiles()).resolves.toEqual([]);
  });

  it("count invalide ou erreur réseau → liste vide", async () => {
    fetchMock.mockResolvedValueOnce(res(JSON.stringify({ count: "x" })));
    const a = await loadWithShare();
    await expect(a.takeSharedFiles()).resolves.toEqual([]);

    fetchMock.mockRejectedValue(new Error("offline"));
    const b = await loadWithShare();
    await expect(b.takeSharedFiles()).resolves.toEqual([]);
  });

  it("un fichier en erreur est ignoré sans casser le lot", async () => {
    fetchMock.mockImplementation((path: string) => {
      if (path === "/__shared-media") return Promise.resolve(res(JSON.stringify({ count: 2 })));
      if (path.endsWith("/0")) return Promise.reject(new Error("boom"));
      return Promise.resolve(res("ok", { headers: { "X-Share-Filename": "b.png" } }));
    });
    const { takeSharedFiles } = await loadWithShare();
    const files = await takeSharedFiles();
    expect(files.map((f) => f.name)).toEqual(["b.png"]);
  });
});
