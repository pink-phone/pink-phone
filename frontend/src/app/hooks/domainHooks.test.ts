import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as api from "../../api/client";
import { useSeen } from "./useSeen";
import { useMoods } from "./useMoods";
import { useChallenges } from "./useChallenges";
import { usePosts } from "./usePosts";
import { useSuggestions } from "./useSuggestions";

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
    a.listChallenges.mockResolvedValue({ items: [mk("c1"), mk("c2")], hasMore: false });
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
    allowDownload: false,
    createdAt: "t",
    updatedAt: "t",
    reactionCounts: {},
    myReactions: [] as string[],
    verdict: null,
    commentCount: 0,
    lastCommentAt: null,
    ...over,
  });

  it("toggleReaction applique le résumé renvoyé par l'API", async () => {
    a.listPosts.mockResolvedValue({ items: [post("p1")], hasMore: false });
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

  it("toggleReaction retire la réaction quand déjà posée (removeReaction)", async () => {
    a.listPosts.mockResolvedValue({
      items: [post("p1", { myReactions: ["fire"], reactionCounts: { fire: 1 } })],
      hasMore: false,
    });
    a.removeReaction.mockResolvedValue({ reactionCounts: {}, myReactions: [] });
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => { await result.current.refetch(); });
    await act(async () => { await result.current.toggleReaction("p1", "fire"); });
    expect(a.removeReaction).toHaveBeenCalledWith("s1", "p1", "fire");
    expect(result.current.posts[0].myReactions).toEqual([]);
  });

  it("addComment ajoute le commentaire et incrémente le compteur du post", async () => {
    a.listPosts.mockResolvedValue({
      items: [post("p1", { commentCount: 2 })],
      hasMore: false,
    });
    a.listComments.mockResolvedValue({ items: [], hasMore: false });
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

// ---------------------------------------------------------------------------
// usePosts — pagination et mutations complémentaires
// ---------------------------------------------------------------------------
describe("usePosts — pagination et mutations complémentaires", () => {
  const mk = (id: string, createdAt = "t") => ({
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
    allowDownload: false,
    createdAt,
    updatedAt: createdAt,
    reactionCounts: {},
    myReactions: [] as string[],
    verdict: null,
    commentCount: 0,
    lastCommentAt: null,
  });

  const cmt = (id: string, createdAt: string) => ({
    id,
    authorId: "u1",
    authorName: "A",
    body: `msg-${id}`,
    createdAt,
  });

  it("loadMore appelle listPosts avec le curseur du dernier post et met à jour postsHasMore", async () => {
    a.listPosts
      .mockResolvedValueOnce({ items: [mk("p2", "t2"), mk("p1", "t1")], hasMore: true })
      .mockResolvedValueOnce({ items: [mk("p0", "t0")], hasMore: false });
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => { await result.current.refetch(); });
    await act(async () => { await result.current.loadMore(); });
    expect(a.listPosts).toHaveBeenNthCalledWith(2, "s1", "t1");
    expect(result.current.posts.map((p) => p.id)).toEqual(["p2", "p1", "p0"]);
    expect(result.current.postsHasMore).toBe(false);
  });

  it("openComments réordonne l'API (DESC) en chronologique (oldest-first)", async () => {
    a.listComments.mockResolvedValue({
      items: [cmt("c3", "t3"), cmt("c2", "t2"), cmt("c1", "t1")],
      hasMore: false,
    });
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => { await result.current.openComments("p1"); });
    expect(result.current.comments.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(result.current.commentsHasMore).toBe(false);
  });

  it("loadMoreComments préfixe les plus anciens et met à jour commentsHasMore", async () => {
    a.listComments
      .mockResolvedValueOnce({
        items: [cmt("c3", "t3"), cmt("c2", "t2")],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [cmt("c1", "t1")],
        hasMore: false,
      });
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => { await result.current.openComments("p1"); });
    // Chronologique après reverse: [c2, c3]. Le plus ancien affiché = c2 ("t2").
    await act(async () => { await result.current.loadMoreComments(); });
    expect(a.listComments).toHaveBeenNthCalledWith(2, "s1", "p1", "t2");
    expect(result.current.comments.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(result.current.commentsHasMore).toBe(false);
  });

  it("add renvoie true et préfixe le nouveau post", async () => {
    a.createPost.mockResolvedValue(mk("pNew"));
    const { result } = renderHook(() => usePosts("s1"));
    let ok = false;
    await act(async () => {
      ok = await result.current.add({ body: "bonjour", draft: false, viewOnce: false, allowDownload: false });
    });
    expect(ok).toBe(true);
    expect(result.current.posts[0].id).toBe("pNew");
  });

  it("add renvoie false si l'API échoue et laisse la liste vide", async () => {
    a.createPost.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => usePosts("s1"));
    let ok = true;
    await act(async () => {
      ok = await result.current.add({ body: "x", draft: false, viewOnce: false, allowDownload: false });
    });
    expect(ok).toBe(false);
    expect(result.current.posts).toHaveLength(0);
  });

  it("remove retire le post de la liste", async () => {
    a.listPosts.mockResolvedValue({ items: [mk("p1"), mk("p2")], hasMore: false });
    a.deletePost.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => { await result.current.refetch(); });
    await act(async () => { await result.current.remove("p1"); });
    expect(result.current.posts.map((p) => p.id)).toEqual(["p2"]);
  });

  it("publish remonte le brouillon publié en tête (created_at = date de publication, B-E)", async () => {
    a.listPosts.mockResolvedValue({
      items: [
        mk("p2", "2026-06-22T10:00:00.000Z"),
        mk("p1", "2026-06-20T10:00:00.000Z"), // brouillon plus ancien
      ],
      hasMore: false,
    });
    // La publication renvoie le post avec un created_at = maintenant (plus récent).
    a.publishPost.mockResolvedValue(mk("p1", "2026-06-23T10:00:00.000Z"));
    const { result } = renderHook(() => usePosts("s1"));
    await act(async () => { await result.current.refetch(); });
    await act(async () => { await result.current.publish("p1"); });
    expect(result.current.posts.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

// ---------------------------------------------------------------------------
// useChallenges — sourceSuggestionId et pagination
// ---------------------------------------------------------------------------
describe("useChallenges — sourceSuggestionId et pagination", () => {
  const mkC = (id: string, createdAt = "t") => ({
    id,
    proposerId: "u2",
    title: "T",
    description: "D",
    intensity: "hot" as const,
    status: "proposed" as const,
    deadlineLabel: null,
    createdAt,
    updatedAt: createdAt,
  });

  it("add transmet le sourceSuggestionId à l'API", async () => {
    a.createChallenge.mockResolvedValue(mkC("cNew"));
    const { result } = renderHook(() => useChallenges("s1"));
    await act(async () => {
      await result.current.add(
        { title: "T", description: "D", intensity: "hot" },
        "sg-123",
      );
    });
    expect(a.createChallenge).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ sourceSuggestionId: "sg-123" }),
    );
  });

  it("add sans sourceSuggestionId envoie undefined", async () => {
    a.createChallenge.mockResolvedValue(mkC("cNew"));
    const { result } = renderHook(() => useChallenges("s1"));
    await act(async () => {
      await result.current.add({ title: "T", description: "D", intensity: "hot" });
    });
    expect(a.createChallenge).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ sourceSuggestionId: undefined }),
    );
  });

  it("loadMore appelle listChallenges avec le curseur du dernier défi", async () => {
    a.listChallenges
      .mockResolvedValueOnce({ items: [mkC("c2", "t2"), mkC("c1", "t1")], hasMore: true })
      .mockResolvedValueOnce({ items: [mkC("c0", "t0")], hasMore: false });
    const { result } = renderHook(() => useChallenges("s1"));
    await act(async () => { await result.current.refetch(); });
    await act(async () => { await result.current.loadMore(); });
    expect(a.listChallenges).toHaveBeenNthCalledWith(2, "s1", "t1");
    expect(result.current.challenges.map((c) => c.id)).toEqual(["c2", "c1", "c0"]);
    expect(result.current.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useSuggestions
// ---------------------------------------------------------------------------
describe("useSuggestions", () => {
  const sg = (id: string, overrides = {}) => ({
    id,
    spaceId: "s1",
    title: "T",
    description: "",
    intensity: "hot" as const,
    locale: "fr",
    done: false,
    hidden: false,
    ...overrides,
  });

  it("setHidden appelle setSuggestionHidden puis recharge la liste", async () => {
    a.listChallengeSuggestions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sg("sg1", { hidden: true })]);
    a.setSuggestionHidden.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useSuggestions("s1", "fr"));
    await waitFor(() => expect(a.listChallengeSuggestions).toHaveBeenCalledTimes(1));

    await act(async () => { await result.current.setHidden("sg1", true); });

    expect(a.setSuggestionHidden).toHaveBeenCalledWith("s1", "sg1", true);
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    expect(result.current.suggestions[0].hidden).toBe(true);
  });

  it("add appelle createSuggestion avec la locale puis recharge", async () => {
    a.listChallengeSuggestions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sg("sg2")]);
    a.createSuggestion.mockResolvedValue(sg("sg2") as never);
    const { result } = renderHook(() => useSuggestions("s1", "fr"));
    await waitFor(() => expect(a.listChallengeSuggestions).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.add({ title: "T", description: "", intensity: "hot" });
    });

    expect(a.createSuggestion).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ title: "T", locale: "fr" }),
    );
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
  });
});
