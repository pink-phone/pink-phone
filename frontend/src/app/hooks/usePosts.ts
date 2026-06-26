import { useCallback, useRef, useState } from "react";
import * as api from "../../api/client";
import type { ApiComment, ApiPost } from "../../api/types";
import type { PostDraft } from "../../components/PostComposer/PostComposer";
import { logClientError } from "../../clientLog";
import { appendOlder, mergeHead, mergeTail } from "./paginate";

/** Remplace un post par son id (identité conservée pour les autres). */
function replaceById(posts: ApiPost[], id: string, next: ApiPost): ApiPost[] {
  return posts.map((p) => (p.id === id ? next : p));
}

/** Tri anté-chronologique (le plus récent d'abord), stable pour les ex æquo. */
function sortByCreatedDesc(posts: ApiPost[]): ApiPost[] {
  return [...posts].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

/**
 * Domaine « blog » : posts + fil de commentaires, tous deux paginés par curseur
 * (RUST-12). `refetch` et `refetchOpenComments` sont stables (`[spaceId]`) pour
 * le WS / la resync : ils refetchent la tête (la plus récente) et la fusionnent
 * avec les pages plus anciennes déjà chargées. `add`/`edit` renvoient un booléen
 * de succès (l'appelant ferme la feuille seulement alors) ; la confirmation de
 * suppression reste à lui.
 */
export function usePosts(spaceId: string) {
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  // Post dont le fil est ouvert, lu par le WS sans recréer la connexion.
  const commentsForRef = useRef<string | null>(null);
  // Des pages plus anciennes ont-elles été chargées ? (cf. useChallenges)
  const postsLoadedOlder = useRef(false);
  // Miroir de `posts` lu de façon synchrone par `toggleReaction` : évite une
  // closure périmée (un refetch WS entre le rendu et le clic ferait sinon
  // décider add/remove sur un ancien `myReactions`) — REACT-01.
  const postsRef = useRef(posts);
  postsRef.current = posts;
  // Miroir de `comments` pour `loadMoreComments` (lit le plus ancien affiché).
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  const refetch = useCallback(async () => {
    try {
      const page = await api.listPosts(spaceId);
      setPosts((prev) => mergeHead(page.items, prev));
      if (!postsLoadedOlder.current) setPostsHasMore(page.hasMore);
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  const loadMore = async () => {
    const cursor = postsRef.current[postsRef.current.length - 1]?.createdAt;
    if (!cursor || postsLoadingMore) return;
    setPostsLoadingMore(true);
    try {
      const page = await api.listPosts(spaceId, cursor);
      postsLoadedOlder.current = true;
      setPosts((prev) => appendOlder(prev, page.items));
      setPostsHasMore(page.hasMore);
    } catch (e) {
      console.error("chargement de posts plus anciens échoué", e);
    } finally {
      setPostsLoadingMore(false);
    }
  };

  // Résout la galerie (#87) en liste ordonnée d'ids : upload les nouveaux
  // fichiers (dans l'ordre), garde les médias existants par id.
  const resolveMediaIds = async (
    media: PostDraft["media"],
    viewOnce: boolean,
  ): Promise<string[]> => {
    const ids: string[] = [];
    for (const it of media) {
      if (it.kind === "existing") {
        ids.push(it.id);
      } else {
        const up = await api.uploadMedia(spaceId, it.file, viewOnce);
        ids.push(up.id);
      }
    }
    return ids;
  };

  const add = async (draft: PostDraft): Promise<boolean> => {
    try {
      const mediaIds = await resolveMediaIds(draft.media, draft.viewOnce);
      const post = await api.createPost(spaceId, {
        title: draft.title,
        body: draft.body,
        mediaIds,
        draft: draft.draft,
        allowDownload: draft.allowDownload,
      });
      setPosts((prev) => [post, ...prev]);
      return true;
    } catch (e) {
      console.error("publication échouée", e);
      logClientError(`addPost échec : ${String(e)}`, "blog/createPost");
      return false;
    }
  };

  const edit = async (postId: string, draft: PostDraft): Promise<boolean> => {
    try {
      const mediaIds = await resolveMediaIds(draft.media, draft.viewOnce);
      const updated = await api.updatePost(spaceId, postId, {
        title: draft.title ?? "",
        body: draft.body,
        draft: draft.draft,
        mediaIds,
        allowDownload: draft.allowDownload,
      });
      // Publier un brouillon change son created_at (date de publication) → il doit
      // remonter en tête. On re-trie (stable : un simple édit ne bouge rien).
      setPosts((prev) => sortByCreatedDesc(replaceById(prev, postId, updated)));
      return true;
    } catch (e) {
      console.error("édition du brouillon échouée", e);
      logClientError(`editPost échec : ${String(e)}`, "blog/updatePost");
      return false;
    }
  };

  const remove = async (postId: string) => {
    try {
      await api.deletePost(spaceId, postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      console.error("suppression du post échouée", e);
    }
  };

  const publish = async (postId: string) => {
    try {
      const updated = await api.publishPost(spaceId, postId);
      // Publié = created_at remis à maintenant → le post remonte en tête.
      setPosts((prev) => sortByCreatedDesc(replaceById(prev, postId, updated)));
    } catch (e) {
      console.error("publication du brouillon échouée", e);
    }
  };

  const toggleReaction = async (postId: string, reaction: string) => {
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;
    const mine = post.myReactions.includes(reaction);
    try {
      const summary = mine
        ? await api.removeReaction(spaceId, postId, reaction)
        : await api.addReaction(spaceId, postId, reaction);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                reactionCounts: summary.reactionCounts,
                myReactions: summary.myReactions,
              }
            : p,
        ),
      );
    } catch (e) {
      console.error("réaction échouée", e);
    }
  };

  // Favori personnel (#96) : optimiste, lit l'état courant via `postsRef` pour
  // décider set/unset (même garde anti-closure-périmée que toggleReaction).
  const toggleFavorite = async (postId: string) => {
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;
    const next = !post.isFavorite;
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, isFavorite: next } : p)),
    );
    try {
      if (next) await api.setFavorite(spaceId, postId);
      else await api.unsetFavorite(spaceId, postId);
    } catch (e) {
      // Échec → on revient à l'état précédent.
      console.error("favori échoué", e);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isFavorite: !next } : p)),
      );
    }
  };

  const openComments = async (postId: string) => {
    setCommentsFor(postId);
    commentsForRef.current = postId;
    setComments([]);
    setCommentsHasMore(false);
    setCommentsLoading(true);
    try {
      // L'API renvoie les plus récents d'abord ; on réordonne en chronologique
      // (plus ancien en haut, plus récent en bas — façon messagerie).
      const page = await api.listComments(spaceId, postId);
      setComments(page.items.slice().reverse());
      setCommentsHasMore(page.hasMore);
    } catch (e) {
      console.error("chargement des commentaires échoué", e);
    } finally {
      setCommentsLoading(false);
    }
  };

  // Charge les commentaires plus anciens (curseur = le plus ancien affiché, en
  // tête de liste en chronologique), préfixés au fil.
  const loadMoreComments = async () => {
    const postId = commentsForRef.current;
    const oldest = commentsRef.current[0]?.createdAt;
    if (!postId || !oldest || commentsLoadingMore) return;
    setCommentsLoadingMore(true);
    try {
      const page = await api.listComments(spaceId, postId, oldest);
      setComments((prev) => [...page.items.slice().reverse(), ...prev]);
      setCommentsHasMore(page.hasMore);
    } catch (e) {
      console.error("chargement de commentaires plus anciens échoué", e);
    } finally {
      setCommentsLoadingMore(false);
    }
  };

  const closeComments = () => {
    setCommentsFor(null);
    commentsForRef.current = null;
  };

  const addComment = async (body: string) => {
    const postId = commentsForRef.current;
    if (!postId) return;
    setCommentBusy(true);
    try {
      const comment = await api.addComment(spaceId, postId, body);
      // Chronologique : mon commentaire s'ajoute en bas du fil.
      setComments((prev) => [...prev, comment]);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
        ),
      );
    } catch (e) {
      console.error("commentaire échoué", e);
    } finally {
      setCommentBusy(false);
    }
  };

  // Renvoie un booléen de succès (REACT2-01) → la feuille ne sort du mode édition
  // qu'au succès, et peut signaler l'échec au lieu de perdre la saisie en silence.
  const editComment = async (
    commentId: string,
    body: string,
  ): Promise<boolean> => {
    const postId = commentsForRef.current;
    if (!postId) return false;
    try {
      const updated = await api.updateComment(spaceId, postId, commentId, body);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c)),
      );
      return true;
    } catch (e) {
      console.error("édition du commentaire échouée", e);
      return false;
    }
  };

  const removeComment = async (commentId: string) => {
    const postId = commentsForRef.current;
    if (!postId) return;
    try {
      await api.deleteComment(spaceId, postId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, commentCount: Math.max(0, p.commentCount - 1) }
            : p,
        ),
      );
    } catch (e) {
      console.error("suppression du commentaire échouée", e);
    }
  };

  // Rafraîchit le fil ouvert (appelé par le WS sur un événement "comment") : on
  // refetch la tête (les plus récents) et on la fusionne avec les commentaires
  // plus anciens déjà chargés.
  const refetchOpenComments = useCallback(() => {
    const postId = commentsForRef.current;
    if (!postId) return;
    api
      .listComments(spaceId, postId)
      .then((page) =>
        setComments((prev) => mergeTail(page.items.slice().reverse(), prev)),
      )
      .catch(() => {});
  }, [spaceId]);

  return {
    posts,
    postsHasMore,
    postsLoadingMore,
    refetch,
    loadMore,
    add,
    edit,
    remove,
    publish,
    toggleReaction,
    toggleFavorite,
    // commentaires
    commentsFor,
    comments,
    commentsLoading,
    commentsHasMore,
    commentsLoadingMore,
    commentBusy,
    openComments,
    closeComments,
    addComment,
    editComment,
    removeComment,
    loadMoreComments,
    refetchOpenComments,
  };
}
