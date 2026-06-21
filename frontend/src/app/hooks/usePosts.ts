import { useCallback, useRef, useState } from "react";
import * as api from "../../api/client";
import type { ApiComment, ApiPost } from "../../api/types";
import type { PostDraft } from "../../components/PostComposer/PostComposer";
import { logClientError } from "../../clientLog";

/**
 * Domaine « blog » : posts + fil de commentaires (couplés via le compteur de
 * commentaires). `refetch` et `refetchOpenComments` sont stables (`[spaceId]`)
 * pour le WS / la resync. `add`/`edit` renvoient un booléen de succès (l'appelant
 * ferme la feuille seulement alors) ; la confirmation de suppression reste à lui.
 */
export function usePosts(spaceId: string) {
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  // Post dont le fil est ouvert, lu par le WS sans recréer la connexion.
  const commentsForRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setPosts(await api.listPosts(spaceId));
    } catch {
      /* best-effort */
    }
  }, [spaceId]);

  const add = async (draft: PostDraft): Promise<boolean> => {
    try {
      let mediaId: string | undefined;
      if (draft.file) {
        const media = await api.uploadMedia(spaceId, draft.file, draft.viewOnce);
        mediaId = media.id;
      }
      const post = await api.createPost(spaceId, {
        title: draft.title,
        body: draft.body,
        mediaId,
        draft: draft.draft,
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
      let mediaId: string | undefined;
      let clearMedia = false;
      if (draft.file) {
        const media = await api.uploadMedia(spaceId, draft.file, draft.viewOnce);
        mediaId = media.id;
      } else if (draft.removeMedia) {
        clearMedia = true;
      }
      const updated = await api.updatePost(spaceId, postId, {
        title: draft.title ?? "",
        body: draft.body,
        draft: draft.draft,
        mediaId,
        clearMedia,
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
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
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
    } catch (e) {
      console.error("publication du brouillon échouée", e);
    }
  };

  const toggleReaction = async (postId: string, reaction: string) => {
    const post = posts.find((p) => p.id === postId);
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

  const openComments = async (postId: string) => {
    setCommentsFor(postId);
    commentsForRef.current = postId;
    setComments([]);
    setCommentsLoading(true);
    try {
      setComments(await api.listComments(spaceId, postId));
    } catch (e) {
      console.error("chargement des commentaires échoué", e);
    } finally {
      setCommentsLoading(false);
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

  // Rafraîchit le fil ouvert (appelé par le WS sur un événement "comment").
  const refetchOpenComments = useCallback(() => {
    const postId = commentsForRef.current;
    if (!postId) return;
    api.listComments(spaceId, postId).then(setComments).catch(() => {});
  }, [spaceId]);

  return {
    posts,
    refetch,
    add,
    edit,
    remove,
    publish,
    toggleReaction,
    // commentaires
    commentsFor,
    comments,
    commentsLoading,
    commentBusy,
    openComments,
    closeComments,
    addComment,
    refetchOpenComments,
  };
}
