import { useEffect, useRef, useState } from "react";
import * as api from "../api/client";
import type {
  ApiChallenge,
  ApiComment,
  ApiPost,
  Member,
  MoodEntry,
  NotifMode,
  Space,
  UserPublic,
} from "../api/types";
import { relativeTime } from "../lib/time";
import { disablePush, enablePush, pushSupported } from "../push";
import { useAuth } from "../auth/AuthContext";

import { SettingsScreen } from "../screens/SettingsScreen/SettingsScreen";

import { AppShell } from "../screens/AppShell/AppShell";
import type { TabId } from "../screens/BottomNav/BottomNav";
import { DashboardScreen } from "../screens/DashboardScreen/DashboardScreen";
import { BlogScreen } from "../screens/BlogScreen/BlogScreen";
import { ChallengesScreen } from "../screens/ChallengesScreen/ChallengesScreen";
import { Splash } from "../screens/Splash/Splash";

import { Sheet } from "../components/Sheet/Sheet";
import { CommentsSheet } from "../components/CommentsSheet/CommentsSheet";
import { PostComposer, type PostDraft } from "../components/PostComposer/PostComposer";
import {
  ChallengeComposer,
  type ChallengeDraft,
} from "../components/ChallengeComposer/ChallengeComposer";

import type { MoodId } from "../components/MoodSelector/moods";
import type { ReactionId } from "../components/ReactionBar/ReactionBar";
import type { ChallengeStatus } from "../components/ChallengeCard/challenge";
import type { ChallengeData, PostData } from "../mock/data";

/** L'app branchée sur un Space réel : charge et pilote les données via l'API. */
export function SpaceApp({ space, user }: { space: Space; user: UserPublic }) {
  const { logout } = useAuth();
  const [tab, setTab] = useState<TabId>("dashboard");
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [challenges, setChallenges] = useState<ApiChallenge[]>([]);
  const [openSheet, setOpenSheet] = useState<"post" | "challenge" | null>(null);
  // Brouillon en cours d'édition (sinon la feuille "post" crée un nouveau post).
  const [editingPost, setEditingPost] = useState<ApiPost | null>(null);

  // Réglages / notifications.
  const [showSettings, setShowSettings] = useState(false);
  const [notifMode, setNotifMode] = useState<NotifMode>("ghost");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  // Préférence d'apparence (par appareil) : effet "braise" des états chauds.
  const [hotAnim, setHotAnim] = useState(
    () => localStorage.getItem("pp_hot_anim") !== "off",
  );

  // Fil de commentaires (chargé à l'ouverture).
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  // Post dont le fil est ouvert, lu par le WS sans recréer la connexion.
  const commentsForRef = useRef<string | null>(null);
  useEffect(() => {
    commentsForRef.current = commentsFor;
  }, [commentsFor]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.members(space.id),
      api.listMoods(space.id),
      api.listPosts(space.id),
      api.listChallenges(space.id),
      api.getSettings().catch(() => ({ notifMode: "ghost" as NotifMode })),
    ])
      .then(([m, mo, p, c, s]) => {
        if (!alive) return;
        setMembers(m);
        setMoods(mo);
        setPosts(p);
        setChallenges(c);
        setNotifMode(s.notifMode);
      })
      .catch((e) => console.error("chargement de l'espace échoué", e))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [space.id]);

  // Applique la préférence "effet braise" globalement (classe sur <html>) + persiste.
  useEffect(() => {
    document.documentElement.classList.toggle("no-hot-anim", !hotAnim);
    localStorage.setItem("pp_hot_anim", hotAnim ? "on" : "off");
  }, [hotAnim]);

  // WebSocket de refresh temps réel : à chaque mutation d'un autre membre, on
  // refetch la liste concernée. Reconnexion auto si la socket tombe.
  useEffect(() => {
    const token = localStorage.getItem("pp_token");
    if (!token) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const handle = (kind: string) => {
      if (kind === "post" || kind === "reaction" || kind === "comment") {
        api.listPosts(space.id).then(setPosts).catch(() => {});
        if (kind === "comment" && commentsForRef.current) {
          api
            .listComments(space.id, commentsForRef.current)
            .then(setComments)
            .catch(() => {});
        }
      } else if (kind === "challenge") {
        api.listChallenges(space.id).then(setChallenges).catch(() => {});
      } else if (kind === "mood") {
        api.listMoods(space.id).then(setMoods).catch(() => {});
      }
    };

    const connect = () => {
      socket = new WebSocket(api.spaceSocketUrl(space.id, token));
      socket.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as { kind?: string };
          if (ev.kind) handle(ev.kind);
        } catch {
          /* message non-JSON ignoré */
        }
      };
      socket.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [space.id]);

  if (!ready) return <Splash message="Chargement de votre espace…" />;

  const partner = members.find((m) => m.id !== user.id);
  const myMood = moods.find((m) => m.userId === user.id)?.status ?? null;
  const partnerMoodEntry = partner
    ? moods.find((m) => m.userId === partner.id)
    : undefined;

  const onMoodChange = (mood: MoodId) => {
    api
      .setMood(space.id, mood)
      .then((entry) =>
        setMoods((prev) => [
          ...prev.filter((m) => m.userId !== entry.userId),
          entry,
        ]),
      )
      .catch((e) => console.error("mise à jour du mood échouée", e));
  };

  const addPost = async (draft: PostDraft) => {
    try {
      let mediaId: string | undefined;
      if (draft.file) {
        const media = await api.uploadMedia(space.id, draft.file, draft.viewOnce);
        mediaId = media.id;
      }
      const post = await api.createPost(space.id, {
        title: draft.title,
        body: draft.body,
        mediaId,
        draft: draft.draft,
      });
      setPosts((prev) => [post, ...prev]);
      setOpenSheet(null);
    } catch (e) {
      console.error("publication échouée", e);
    }
  };

  const deletePost = async (postId: string) => {
    if (!window.confirm("Supprimer ce post ? C'est définitif.")) return;
    try {
      await api.deletePost(space.id, postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      console.error("suppression du post échouée", e);
    }
  };

  const publishPost = async (postId: string) => {
    try {
      const updated = await api.publishPost(space.id, postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
    } catch (e) {
      console.error("publication du brouillon échouée", e);
    }
  };

  const editPost = async (postId: string, draft: PostDraft) => {
    try {
      let mediaId: string | undefined;
      let clearMedia = false;
      if (draft.file) {
        const media = await api.uploadMedia(space.id, draft.file, draft.viewOnce);
        mediaId = media.id;
      } else if (draft.removeMedia) {
        clearMedia = true;
      }
      const updated = await api.updatePost(space.id, postId, {
        title: draft.title ?? "",
        body: draft.body,
        draft: draft.draft,
        mediaId,
        clearMedia,
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
      setOpenSheet(null);
      setEditingPost(null);
    } catch (e) {
      console.error("édition du brouillon échouée", e);
    }
  };

  const addChallenge = async (draft: ChallengeDraft) => {
    try {
      const challenge = await api.createChallenge(space.id, {
        title: draft.title,
        description: draft.description,
        intensity: draft.intensity,
        deadlineLabel: draft.deadlineLabel,
      });
      setChallenges((prev) => [challenge, ...prev]);
      setOpenSheet(null);
    } catch (e) {
      console.error("proposition de défi échouée", e);
    }
  };

  const transition = (id: string, status: ChallengeStatus) => {
    api
      .transitionChallenge(space.id, id, status)
      .then((updated) =>
        setChallenges((prev) => prev.map((c) => (c.id === id ? updated : c))),
      )
      .catch((e) => console.error("transition de défi échouée", e));
  };

  const deleteChallenge = async (id: string) => {
    if (!window.confirm("Supprimer ce défi ? C'est définitif.")) return;
    try {
      await api.deleteChallenge(space.id, id);
      setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("suppression du défi échouée", e);
    }
  };

  const toggleReaction = async (postId: string, reaction: ReactionId) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const mine = post.myReactions.includes(reaction);
    try {
      const summary = mine
        ? await api.removeReaction(space.id, postId, reaction)
        : await api.addReaction(space.id, postId, reaction);
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
    setComments([]);
    setCommentsLoading(true);
    try {
      setComments(await api.listComments(space.id, postId));
    } catch (e) {
      console.error("chargement des commentaires échoué", e);
    } finally {
      setCommentsLoading(false);
    }
  };

  const addComment = async (body: string) => {
    if (!commentsFor) return;
    setCommentBusy(true);
    try {
      const comment = await api.addComment(space.id, commentsFor, body);
      setComments((prev) => [...prev, comment]);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === commentsFor
            ? { ...p, commentCount: p.commentCount + 1 }
            : p,
        ),
      );
    } catch (e) {
      console.error("commentaire échoué", e);
    } finally {
      setCommentBusy(false);
    }
  };

  const changeNotifMode = async (mode: NotifMode) => {
    setSettingsBusy(true);
    setPushError(null);
    try {
      // Le mode "push" exige une permission + un abonnement ; sinon on s'en retire.
      if (mode === "push") await enablePush();
      else await disablePush();
      await api.updateSettings(mode);
      setNotifMode(mode);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "action impossible");
    } finally {
      setSettingsBusy(false);
    }
  };

  if (showSettings) {
    return (
      <div className="mx-auto min-h-dvh max-w-md overflow-y-auto bg-charcoal-900 bg-felt-velvet px-4 pb-10 pt-[calc(1rem+env(safe-area-inset-top))]">
        <SettingsScreen
          notifMode={notifMode}
          onModeChange={changeNotifMode}
          pushSupported={pushSupported()}
          pushError={pushError}
          busy={settingsBusy}
          hotAnimEnabled={hotAnim}
          onHotAnimChange={setHotAnim}
          onBack={() => setShowSettings(false)}
          onLogout={logout}
        />
      </div>
    );
  }

  // ----- mapping API -> props des écrans -----

  const postData: PostData[] = posts.map((p) => ({
    id: p.id,
    author: { name: p.authorName, glyph: p.authorName.charAt(0) },
    timeLabel: relativeTime(p.createdAt),
    title: p.title ?? undefined,
    body: p.body,
    media: p.mediaId
      ? {
          alt: "Photo partagée",
          viewOnce: p.mediaViewOnce ?? false,
          consumed: p.mediaConsumed ?? false,
          loader: () => api.fetchMediaObjectUrl(space.id, p.mediaId as string),
        }
      : undefined,
    reactionCounts: p.reactionCounts,
    myReactions: p.myReactions,
    verdict: p.verdict,
    commentCount: p.commentCount,
    draft: p.draft,
    isMine: p.authorId === user.id,
  }));

  const challengeData: ChallengeData[] = challenges.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    intensity: c.intensity,
    status: c.status,
    deadlineLabel: c.deadlineLabel ?? undefined,
    perspective: c.proposerId === user.id ? "proposer" : "recipient",
  }));

  const proposedCount = challenges.filter((c) => c.status === "proposed").length;

  const commentViews = comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    body: c.body,
    timeLabel: relativeTime(c.createdAt),
  }));

  return (
    <AppShell
      active={tab}
      onTabChange={setTab}
      badges={{ challenges: proposedCount }}
    >
      {tab === "dashboard" && (
        <DashboardScreen
          spaceName={space.name}
          partner={
            partner
              ? { name: partner.displayName, glyph: partner.displayName.charAt(0) }
              : undefined
          }
          partnerMood={
            partnerMoodEntry
              ? {
                  mood: partnerMoodEntry.status,
                  timeLabel: relativeTime(partnerMoodEntry.updatedAt),
                }
              : undefined
          }
          inviteId={space.id}
          myMood={myMood}
          onMoodChange={onMoodChange}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {tab === "blog" && (
        <BlogScreen
          posts={postData}
          onCompose={() => setOpenSheet("post")}
          onToggleReaction={toggleReaction}
          onOpenComments={openComments}
          onDeletePost={deletePost}
          onPublishPost={publishPost}
          onEditPost={(id) => {
            const p = posts.find((x) => x.id === id);
            if (p) {
              setEditingPost(p);
              setOpenSheet("post");
            }
          }}
        />
      )}

      {tab === "challenges" && (
        <ChallengesScreen
          challenges={challengeData}
          onNew={() => setOpenSheet("challenge")}
          onAccept={(id) => transition(id, "challengeAccepted")}
          onNegotiate={(id) => transition(id, "maybeMaybe")}
          onComplete={(id) => transition(id, "jobDone")}
          onDelete={deleteChallenge}
        />
      )}

      <Sheet
        open={openSheet === "post"}
        title={editingPost ? "Modifier le brouillon" : "Écrire"}
        // En édition, on s'offre de la place pour rédiger (≈ 3/4 d'écran).
        className={editingPost ? "min-h-[75dvh]" : undefined}
        onClose={() => {
          setOpenSheet(null);
          setEditingPost(null);
        }}
      >
        <PostComposer
          key={editingPost?.id ?? "new"}
          initial={
            editingPost
              ? {
                  title: editingPost.title ?? undefined,
                  body: editingPost.body,
                  media: editingPost.mediaId
                    ? {
                        viewOnce: editingPost.mediaViewOnce ?? false,
                        alt: "Photo jointe",
                        loader: () =>
                          api.fetchMediaObjectUrl(
                            space.id,
                            editingPost.mediaId as string,
                          ),
                      }
                    : undefined,
                }
              : undefined
          }
          onSubmit={
            editingPost ? (d) => editPost(editingPost.id, d) : addPost
          }
          onCancel={() => {
            setOpenSheet(null);
            setEditingPost(null);
          }}
        />
      </Sheet>

      <Sheet
        open={openSheet === "challenge"}
        title="Lancer un défi"
        onClose={() => setOpenSheet(null)}
      >
        <ChallengeComposer
          onSubmit={addChallenge}
          onCancel={() => setOpenSheet(null)}
        />
      </Sheet>

      <CommentsSheet
        open={commentsFor !== null}
        comments={commentViews}
        loading={commentsLoading}
        busy={commentBusy}
        onAdd={addComment}
        onClose={() => setCommentsFor(null)}
      />
    </AppShell>
  );
}
