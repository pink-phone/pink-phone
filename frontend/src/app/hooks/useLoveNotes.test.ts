import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as api from "../../api/client";
import { useLoveNotes } from "./useLoveNotes";
import { useSuggestions } from "./useSuggestions";

vi.mock("../../api/client");

const a = vi.mocked(api, true);
const note = (id: string) => ({ id, body: id }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useLoveNotes", () => {
  it("refetch charge les mots ; une erreur est avalée", async () => {
    a.listLoveNotes.mockResolvedValueOnce([note("n1")]);
    const { result } = renderHook(() => useLoveNotes("s1"));
    await act(() => result.current.refetch());
    expect(result.current.notes).toHaveLength(1);
    a.listLoveNotes.mockRejectedValueOnce(new Error("down"));
    await act(() => result.current.refetch());
    expect(result.current.notes).toHaveLength(1);
  });

  it("add préfixe la liste et renvoie true ; false sur échec", async () => {
    a.listLoveNotes.mockResolvedValue([note("n1")]);
    a.createLoveNote.mockResolvedValueOnce(note("n2"));
    const { result } = renderHook(() => useLoveNotes("s1"));
    await act(() => result.current.refetch());
    let ok = false;
    await act(async () => {
      ok = await result.current.add("coucou", "2026-12-24T00:00:00Z");
    });
    expect(ok).toBe(true);
    expect(a.createLoveNote).toHaveBeenCalledWith("s1", {
      body: "coucou",
      openAt: "2026-12-24T00:00:00Z",
    });
    expect(result.current.notes.map((n) => n.id)).toEqual(["n2", "n1"]);

    a.createLoveNote.mockRejectedValueOnce(new Error("x"));
    await act(async () => {
      ok = await result.current.add("raté");
    });
    expect(ok).toBe(false);
    expect(result.current.notes).toHaveLength(2);
  });

  it("remove retire le mot ; en cas d'échec il reste", async () => {
    a.listLoveNotes.mockResolvedValue([note("n1"), note("n2")]);
    a.deleteLoveNote.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useLoveNotes("s1"));
    await act(() => result.current.refetch());
    await act(() => result.current.remove("n1"));
    expect(result.current.notes.map((n) => n.id)).toEqual(["n2"]);
    a.deleteLoveNote.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.remove("n2"));
    expect(result.current.notes.map((n) => n.id)).toEqual(["n2"]);
  });
});

describe("useSuggestions — chemins d'erreur", () => {
  const draft = { title: "t", description: "d", intensity: "hot" as never };

  it("chaque mutation recharge la banque, et avale l'échec", async () => {
    a.listChallengeSuggestions.mockResolvedValue([]);
    a.createSuggestion.mockResolvedValue(undefined as never);
    a.updateSuggestion.mockResolvedValue(undefined as never);
    a.deleteSuggestion.mockResolvedValue(undefined);
    a.setSuggestionHidden.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSuggestions("s1", "fr"));
    await act(async () => {});
    const base = a.listChallengeSuggestions.mock.calls.length;

    await act(() => result.current.add(draft));
    await act(() => result.current.edit("x", draft));
    await act(() => result.current.remove("x"));
    await act(() => result.current.setHidden("x", true));
    expect(a.listChallengeSuggestions.mock.calls.length).toBe(base + 4);
    expect(a.createSuggestion).toHaveBeenCalledWith("s1", { ...draft, locale: "fr" });

    a.createSuggestion.mockRejectedValue(new Error("1"));
    a.updateSuggestion.mockRejectedValue(new Error("2"));
    a.deleteSuggestion.mockRejectedValue(new Error("3"));
    a.setSuggestionHidden.mockRejectedValue(new Error("4"));
    await act(() => result.current.add(draft));
    await act(() => result.current.edit("x", draft));
    await act(() => result.current.remove("x"));
    await act(() => result.current.setHidden("x", false));
    expect(a.listChallengeSuggestions.mock.calls.length).toBe(base + 4);
    expect(console.error).toHaveBeenCalledTimes(4);
  });

  it("un échec de chargement initial laisse la liste vide", async () => {
    a.listChallengeSuggestions.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useSuggestions("s1", "fr"));
    await act(async () => {});
    expect(result.current.suggestions).toEqual([]);
  });
});
