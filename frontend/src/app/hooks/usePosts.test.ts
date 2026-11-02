import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as api from "../../api/client";
import type { PostDraft } from "../../components/PostComposer/PostComposer";
import { usePosts } from "./usePosts";

vi.mock("../../api/client");
vi.mock("../../clientLog", () => ({ logClientError: vi.fn() }));

const a = vi.mocked(api, true);

const post = (id: string, createdAt: string, over: object = {}) =>
  ({
    id,
    authorId: "u2",
    authorName: "Sam",
    title: null,
    body: "x",
    media: [],
    draft: false,
    allowDownload: false,
    createdAt,
    updatedAt: createdAt,
    reactionCounts: {},
    myReactions: [] as string[],
    verdict: null,
    isFavorite: false,
    commentCount: 0,
    lastCommentAt: null,
    ...over,
  }) as never;

const comment = (id: string, createdAt: string) =>
  ({ id, body: id, createdAt }) as never;

const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
  title: "T",
  body: "B",
  media: [],
  viewOnce: false,
  allowDownload: true,
  draft: false,
  ...over,
});

async function loaded(items = [post("p2", "2026-02"), post("p1", "2026-01")], hasMore = false) {
  a.listPosts.mockResolvedValueOnce({ items, hasMore });
  const hook = renderHook(() => usePosts("s1"));
  await act(() => hook.result.current.refetch());
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("usePosts — pagination", () => {
  it("refetch : erreur avalée, hasMore suivi", async () => {
    const { result } = await loaded([post("p1", "2026-01")], true);
    expect(result.current.postsHasMore).toBe(true);
    a.listPosts.mockRejectedValueOnce(new Error("down"));
    await act(() => result.current.refetch());
    expect(result.current.posts).toHaveLength(1);
  });

  it("loadMore ajoute les posts plus anciens avec le curseur du dernier", async () => {
    const { result } = await loaded([post("p2", "2026-02"), post("p1", "2026-01")], true);
    a.listPosts.mockResolvedValueOnce({ items: [post("p0", "2025-12")], hasMore: false });
    await act(() => result.current.loadMore());
    expect(a.listPosts).toHaveBeenLastCalledWith("s1", "2026-01");
    expect(result.current.posts.map((p) => p.id)).toEqual(["p2", "p1", "p0"]);
    expect(result.current.postsHasMore).toBe(false);
    expect(result.current.postsLoadingMore).toBe(false);
  });

  it("loadMore sans posts ne fait rien ; une erreur remet loadingMore à false", async () => {
    const empty = renderHook(() => usePosts("s1"));
    await act(() => empty.result.current.loadMore());
    expect(a.listPosts).not.toHaveBeenCalled();

    const { result } = await loaded();
    a.listPosts.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.loadMore());
    expect(result.current.postsLoadingMore).toBe(false);
  });

  it("après un loadMore, un refetch ne réécrit plus hasMore", async () => {
    const { result } = await loaded([post("p1", "2026-01")], true);
    a.listPosts.mockResolvedValueOnce({ items: [], hasMore: false });
    await act(() => result.current.loadMore());
    expect(result.current.postsHasMore).toBe(false);
    a.listPosts.mockResolvedValueOnce({ items: [post("p1", "2026-01")], hasMore: true });
    await act(() => result.current.refetch());
    expect(result.current.postsHasMore).toBe(false);
  });
});

describe("usePosts — création / édition / suppression", () => {
  it("add uploade les nouveaux médias, garde les existants, préfixe le post", async () => {
    const { result } = await loaded();
    a.uploadMedia.mockResolvedValue({ id: "up1" } as never);
    a.createPost.mockResolvedValue(post("p3", "2026-03"));
    const file = new File(["x"], "a.png");
    let ok = false;
    await act(async () => {
      ok = await result.current.add(
        draft({
          viewOnce: true,
          media: [
            { kind: "existing", id: "m0" },
            { kind: "new", file },
          ],
        }),
      );
    });
    expect(ok).toBe(true);
    expect(a.uploadMedia).toHaveBeenCalledWith("s1", file, true);
    expect(a.createPost).toHaveBeenCalledWith("s1", {
      title: "T",
      body: "B",
      mediaIds: ["m0", "up1"],
      draft: false,
      allowDownload: true,
    });
    expect(result.current.posts[0].id).toBe("p3");
  });

  it("add renvoie false si l'upload ou la création échoue", async () => {
    const { result } = await loaded();
    a.uploadMedia.mockRejectedValueOnce(new Error("413"));
    let ok = true;
    await act(async () => {
      ok = await result.current.add(draft({ media: [{ kind: "new", file: new File(["x"], "a") }] }));
    });
    expect(ok).toBe(false);
    expect(a.createPost).not.toHaveBeenCalled();
  });

  it("edit remplace le post et re-trie ; titre absent → chaîne vide ; false sur échec", async () => {
    const { result } = await loaded();
    a.updatePost.mockResolvedValueOnce(post("p1", "2026-09", { body: "neuf" }));
    let ok = false;
    await act(async () => {
      ok = await result.current.edit("p1", draft({ title: undefined }));
    });
    expect(ok).toBe(true);
    expect(a.updatePost).toHaveBeenCalledWith("s1", "p1", expect.objectContaining({ title: "" }));
    expect(result.current.posts.map((p) => p.id)).toEqual(["p1", "p2"]);

    a.updatePost.mockRejectedValueOnce(new Error("x"));
    await act(async () => {
      ok = await result.current.edit("p2", draft());
    });
    expect(ok).toBe(false);
  });

  it("remove retire le post ; en cas d'échec il reste", async () => {
    const { result } = await loaded();
    a.deletePost.mockResolvedValueOnce(undefined);
    await act(() => result.current.remove("p1"));
    expect(result.current.posts.map((p) => p.id)).toEqual(["p2"]);
    a.deletePost.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.remove("p2"));
    expect(result.current.posts).toHaveLength(1);
  });

  it("publish remonte le brouillon en tête ; échec sans effet", async () => {
    const { result } = await loaded([post("p2", "2026-02"), post("d1", "2026-01", { draft: true })]);
    a.publishPost.mockResolvedValueOnce(post("d1", "2026-12"));
    await act(() => result.current.publish("d1"));
    expect(result.current.posts.map((p) => p.id)).toEqual(["d1", "p2"]);
    a.publishPost.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.publish("p2"));
    expect(result.current.posts).toHaveLength(2);
  });
});

describe("usePosts — réactions et favoris", () => {
  it("toggleReaction : post inconnu = no-op, échec = état inchangé", async () => {
    const { result } = await loaded();
    await act(() => result.current.toggleReaction("nope", "🔥"));
    expect(a.addReaction).not.toHaveBeenCalled();
    a.addReaction.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.toggleReaction("p1", "🔥"));
    expect(result.current.posts.find((p) => p.id === "p1")!.myReactions).toEqual([]);
  });

  it("toggleFavorite : optimiste, set puis unset", async () => {
    const { result } = await loaded();
    a.setFavorite.mockResolvedValue({ favorite: true });
    a.unsetFavorite.mockResolvedValue({ favorite: false });
    await act(() => result.current.toggleFavorite("p1"));
    expect(a.setFavorite).toHaveBeenCalledWith("s1", "p1");
    expect(result.current.posts.find((p) => p.id === "p1")!.isFavorite).toBe(true);
    await act(() => result.current.toggleFavorite("p1"));
    expect(a.unsetFavorite).toHaveBeenCalledWith("s1", "p1");
    expect(result.current.posts.find((p) => p.id === "p1")!.isFavorite).toBe(false);
  });

  it("toggleFavorite : annulation de l'optimiste sur échec ; post inconnu no-op", async () => {
    const { result } = await loaded();
    await act(() => result.current.toggleFavorite("nope"));
    expect(a.setFavorite).not.toHaveBeenCalled();
    a.setFavorite.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.toggleFavorite("p1"));
    expect(result.current.posts.find((p) => p.id === "p1")!.isFavorite).toBe(false);
  });
});

describe("usePosts — commentaires", () => {
  async function withThread() {
    const hook = await loaded([post("p1", "2026-01", { commentCount: 2 })]);
    // L'API renvoie les plus récents d'abord ; le hook les remet en chronologique.
    a.listComments.mockResolvedValueOnce({
      items: [comment("c2", "2026-01-02"), comment("c1", "2026-01-01")],
      hasMore: true,
    });
    await act(() => hook.result.current.openComments("p1"));
    return hook;
  }

  it("openComments charge en chronologique, closeComments referme", async () => {
    const { result } = await withThread();
    expect(result.current.commentsFor).toBe("p1");
    expect(result.current.comments.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(result.current.commentsHasMore).toBe(true);
    expect(result.current.commentsLoading).toBe(false);
    act(() => result.current.closeComments());
    expect(result.current.commentsFor).toBeNull();
  });

  it("openComments : une erreur met fin au chargement", async () => {
    const { result } = await loaded([post("p1", "2026-01")]);
    a.listComments.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.openComments("p1"));
    expect(result.current.commentsLoading).toBe(false);
    expect(result.current.comments).toEqual([]);
  });

  it("loadMoreComments préfixe les plus anciens ; sans fil ouvert = no-op", async () => {
    const closed = renderHook(() => usePosts("s1"));
    await act(() => closed.result.current.loadMoreComments());
    expect(a.listComments).not.toHaveBeenCalled();

    const { result } = await withThread();
    a.listComments.mockResolvedValueOnce({ items: [comment("c0", "2025-12-31")], hasMore: false });
    await act(() => result.current.loadMoreComments());
    expect(a.listComments).toHaveBeenLastCalledWith("s1", "p1", "2026-01-01");
    expect(result.current.comments.map((c) => c.id)).toEqual(["c0", "c1", "c2"]);
    expect(result.current.commentsHasMore).toBe(false);

    a.listComments.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.loadMoreComments());
    expect(result.current.commentsLoadingMore).toBe(false);
  });

  it("addComment ajoute en bas et incrémente ; removeComment décrémente (min 0)", async () => {
    const { result } = await withThread();
    a.addComment.mockResolvedValueOnce(comment("c3", "2026-01-03"));
    await act(() => result.current.addComment("salut"));
    expect(result.current.comments.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(result.current.posts[0].commentCount).toBe(3);
    expect(result.current.commentBusy).toBe(false);

    a.deleteComment.mockResolvedValue(undefined);
    await act(() => result.current.removeComment("c3"));
    expect(result.current.comments.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(result.current.posts[0].commentCount).toBe(2);
  });

  it("addComment / removeComment : échecs et absence de fil sont sans effet", async () => {
    const closed = renderHook(() => usePosts("s1"));
    await act(() => closed.result.current.addComment("x"));
    await act(() => closed.result.current.removeComment("c"));
    expect(await closed.result.current.editComment("c", "x")).toBe(false);
    expect(a.addComment).not.toHaveBeenCalled();

    const { result } = await withThread();
    a.addComment.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.addComment("raté"));
    expect(result.current.comments).toHaveLength(2);
    a.deleteComment.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.removeComment("c1"));
    expect(result.current.comments).toHaveLength(2);
  });

  it("editComment remplace et renvoie true ; false sur échec", async () => {
    const { result } = await withThread();
    a.updateComment.mockResolvedValueOnce({ id: "c1", body: "modifié", createdAt: "2026-01-01" } as never);
    let ok = false;
    await act(async () => {
      ok = await result.current.editComment("c1", "modifié");
    });
    expect(ok).toBe(true);
    expect(result.current.comments.find((c) => c.id === "c1")!.body).toBe("modifié");
    a.updateComment.mockRejectedValueOnce(new Error("x"));
    await act(async () => {
      ok = await result.current.editComment("c1", "x");
    });
    expect(ok).toBe(false);
  });

  it("refetchOpenComments fusionne la tête ; no-op sans fil ouvert ; erreur avalée", async () => {
    const closed = renderHook(() => usePosts("s1"));
    act(() => closed.result.current.refetchOpenComments());
    expect(a.listComments).not.toHaveBeenCalled();

    const { result } = await withThread();
    a.listComments.mockResolvedValueOnce({
      items: [comment("c3", "2026-01-03"), comment("c2", "2026-01-02")],
      hasMore: false,
    });
    await act(async () => {
      result.current.refetchOpenComments();
    });
    expect(result.current.comments.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    a.listComments.mockRejectedValueOnce(new Error("x"));
    await act(async () => {
      result.current.refetchOpenComments();
    });
    expect(result.current.comments).toHaveLength(3);
  });
});
