import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearAllPostDrafts,
  clearPostDraft,
  loadPostDraft,
  savePostDraft,
} from "./postDraft";

// localStorage indispo sous Node 26+ : stub minimal en mémoire (API Storage).
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
});

describe("lib/postDraft", () => {
  it("aucun brouillon au départ", () => {
    expect(loadPostDraft("u1", "s1")).toBeUndefined();
  });

  it("sauve puis relit, isolé par utilisateur et salon", () => {
    savePostDraft("u1", "s1", { title: "T", body: "corps" });
    expect(loadPostDraft("u1", "s1")).toEqual({ title: "T", body: "corps" });
    expect(loadPostDraft("u2", "s1")).toBeUndefined();
    expect(loadPostDraft("u1", "s2")).toBeUndefined();
  });

  it("un brouillon vide supprime l'entrée", () => {
    savePostDraft("u1", "s1", { title: "", body: "x" });
    savePostDraft("u1", "s1", { title: " ", body: "  " });
    expect(loadPostDraft("u1", "s1")).toBeUndefined();
  });

  it("clearPostDraft efface", () => {
    savePostDraft("u1", "s1", { title: "", body: "x" });
    clearPostDraft("u1", "s1");
    expect(loadPostDraft("u1", "s1")).toBeUndefined();
  });

  it("ignore un contenu corrompu", () => {
    localStorage.setItem("pp_post_draft:u1:s1", "{pas du json");
    expect(loadPostDraft("u1", "s1")).toBeUndefined();
  });

  it("clearAllPostDrafts n'efface que les brouillons", () => {
    savePostDraft("u1", "s1", { title: "", body: "x" });
    localStorage.setItem("pp_token", "t");
    clearAllPostDrafts();
    expect(loadPostDraft("u1", "s1")).toBeUndefined();
    expect(localStorage.getItem("pp_token")).toBe("t");
  });
});
