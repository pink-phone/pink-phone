import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as api from "../../api/client";
import { useSeen } from "./useSeen";
import { useMoods } from "./useMoods";
import { useChallenges } from "./useChallenges";
import { usePosts } from "./usePosts";

// On simule entièrement le client API : les hooks sont testés en isolation, sans
// réseau. `clientLog` est neutralisé (évite un setTimeout de flush en arrière-plan).
vi.mock("../../api/client");
vi.mock("../../clientLog", () => ({ logClientError: vi.fn() }));

const a = vi.mocked(api, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSeen", () => {
  it("refetch alimente l'état seen", async () => {
    a.listSeen.mockResolvedValue([
      { userId: "u1", feature: "blog", seenAt: "2026-06-20T10:00:00Z" },
    ]);
    const { result } = renderHook(() => useSeen("s1", "me"));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.seen).toHaveLength(1);
  });

  it("markSeen remplace mon entrée pour la feature (dédoublonnage)", async () => {
    a.listSeen.mockResolvedValue([
      { userId: "me", feature: "blog", seenAt: "old" },
    ]);
    a.markSeen.mockResolvedValue({
      userId: "me",
      feature: "blog",
      seenAt: "new",
    });
    const { result } = renderHook(() => useSeen("s1", "me"));
    await act(async () => {
      await result.current.refetch();
    });
    act(() => result.current.markSeen("blog"));
    await waitFor(() => {
      const mine = result.current.seen.filter(
        (s) => s.userId === "me" && s.feature === "blog",
      );
      expect(mine).toHaveLength(1);
      expect(mine[0].seenAt).toBe("new");
    });
  });
});

describe("useMoods", () => {
  it("setMood remplace mon humeur dans la liste", async () => {
    a.setMood.mockResolvedValue({
      userId: "me",
      status: "veryHot",
      updatedAt: "now",
    });
    const { result } = renderHook(() => useMoods("s1", "me", false));
    act(() => result.current.setMood("veryHot"));
    await waitFor(() => {
      expect(result.current.moods).toEqual([
        { userId: "me", status: "veryHot", updatedAt: "now" },
      ]);
    });
  });

  it("clearMood retire mon humeur ; en blindMood, resynchronise", async () => {
    a.setMood.mockResolvedValue({
      userId: "me",
      status: "calm",
      updatedAt: "t",
    });
    a.clearMood.mockResolvedValue(undefined as never);
    // En blindMood chaque mutation déclenche un listMoods de resynchro : on
    // simule la révélation (mon humeur visible) puis le re-masquage (vide).
    a.listMoods
      .mockResolvedValueOnce([{ userId: "me", status: "calm", updatedAt: "t" }])
      .mockResolvedValueOnce([]);
    const { result } = renderHook(() => useMoods("s1", "me", true));
    act(() => result.current.setMood("calm"));
    await waitFor(() => expect(result.current.moods).toHaveLength(1));

    act(() => result.current.clearMood());
    await waitFor(() => expect(result.current.moods).toHaveLength(0));
    // blindMood => un listMoods de resynchro est déclenché.
    expect(a.listMoods).toHaveBeenCalledWith("s1");
  });
});

describe("useChallenges", () => {
  const mk = (id: string) => ({
    id,
    proposerId: "u2",
    title: "T",
    description: "D",
    intensity: "hot" as const,
    status: "proposed" as const,
    deadlineLabel: null,
    createdAt: "t",
    updatedAt: "t",
  });

  it("add préfixe la liste et renvoie true", async () => {
    a.createChallenge.mockResolvedValue(mk("c1"));
    const { result } = renderHook(() => useChallenges("s1"));
    let ok = false;
    await act(async () => {
      ok = await result.current.add({
        title: "T",
        description: "D",
        intensity: "hot",
      });
    });
    expect(ok).toBe(true);
    expect(result.current.challenges.map((c) => c.id)).toEqual(["c1"]);
  });

  it("remove retire le défi de la liste", async () => {
    a.listChallenges.mockResolvedValue([mk("c1"), mk("c2")]);
    a.deleteChallenge.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useChallenges("s1"));
    await act(async () => {
      await result.current.refetch();
    });
    await act(async () => {
      await result.current.remove("c1");
    });
    expect(result.current.challenges.map((c) => c.id)).toEqual(["c2"]);
  });

  it("add renvoie false si l'API échoue (la liste ne bouge pas)", async () => {
    a.createChallenge.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useChallenges("s1"));
    let ok = true;
    await act(async () => {
      ok = await result.current.add({
        title: "T",
        description: "D",
        intensity: "hot",
      });
    });
    expect(ok).toBe(false);
    expect(result.current.challenges).toHaveLength(0);
  });
});

describe("usePosts", () => {
  const post = (id: string, over = {}) => ({
    id,
    authorId: "u2",
    authorName: "Sam",
    title: null,
    body: "x",
    mediaId: null,
    mediaViewOnce: null,
    mediaConsumed: null,
    mediaMime: null,
    draft: false,
    createdAt: "t",
    reactionCounts: {},
    myReactions: [] as string[],
    verdict: null,
    commentCount: 0,
    lastCommentAt: null,
    ...over,
  });

  it("toggleReaction applique le résumé renvoyé par l'API", async () => {
    a.listPosts.mockResolvedValue([post("p1")]);
    a.addReaction.mockResolvedValue({
      reactionCounts: { fire: 1 },
      myReactions: ["fire"],
    });
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => {
      await result.current.refetch();
    });
    await act(async () => {
      await result.current.toggleReaction("p1", "fire");
    });
    expect(result.current.posts[0].myReactions).toEqual(["fire"]);
    expect(result.current.posts[0].reactionCounts).toEqual({ fire: 1 });
  });

  it("addComment ajoute le commentaire et incrémente le compteur du post", async () => {
    a.listPosts.mockResolvedValue([post("p1", { commentCount: 2 })]);
    a.listComments.mockResolvedValue([]);
    a.addComment.mockResolvedValue({
      id: "k1",
      authorId: "me",
      authorName: "Moi",
      body: "joli",
      createdAt: "t",
    });
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => {
      await result.current.refetch();
    });
    await act(async () => {
      await result.current.openComments("p1");
    });
    await act(async () => {
      await result.current.addComment("joli");
    });
    expect(result.current.comments.map((c) => c.id)).toEqual(["k1"]);
    expect(result.current.posts[0].commentCount).toBe(3);
  });
});
