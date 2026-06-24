import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api/client";
import { confirmAction } from "../lib/confirm";
import type {
  ApiChallenge,
  ApiPost,
  Member,
  Notice,
  NotifMode,
  Space,
  UserPublic,
} from "../api/types";
import { relativeTime } from "../lib/time";
import { useBackClose } from "../lib/useBackClose";
import { disablePush, enablePush, pushSupported } from "../push";
import { useAuth } from "../auth/AuthContext";

import { SettingsScreen } from "../screens/SettingsScreen/SettingsScreen";

import { AppShell } from "../screens/AppShell/AppShell";
import type { TabId } from "../screens/BottomNav/BottomNav";
import { DashboardScreen } from "../screens/DashboardScreen/DashboardScreen";
import { BlogScreen } from "../screens/BlogScreen/BlogScreen";
import { ChallengesScreen } from "../screens/ChallengesScreen/ChallengesScreen";
import { ChallengeBankScreen } from "../screens/ChallengeBankScreen/ChallengeBankScreen";
import { Splash } from "../screens/Splash/Splash";

import { Sheet } from "../components/Sheet/Sheet";
import { CommentsSheet } from "../components/CommentsSheet/CommentsSheet";
import { PostComposer, type PostDraft } from "../components/PostComposer/PostComposer";
import {
  ChallengeComposer,
  type ChallengeDraft,
} from "../components/ChallengeComposer/ChallengeComposer";

import type { ReactionId } from "../components/ReactionBar/ReactionBar";
import type { ChallengeData, PostData } from "../types/view";

import { useSpaceSocket } from "./hooks/useSpaceSocket";
import { useSuggestions } from "./hooks/useSuggestions";
import { usePosts } from "./hooks/usePosts";
import { useChallenges } from "./hooks/useChallenges";
import { useMoods } from "./hooks/useMoods";
import { useSeen } from "./hooks/useSeen";
import {
  toChallengeData,
  toCommentViews,
  toDashboardNotices,
  toPostData,
} from "./mappers";

/** L'app branchée sur un Space réel : charge et pilote les données via l'API. */
export function SpaceApp({
  space: initialSpace,
  user,
  spaces = [],
  onSwitchSpace,
  onCreateSpace,
  onJoinSpace,
}: {
  space: Space;
  user: UserPublic;
  /** Tous les salons de l'utilisateur (multi-space, #67). */
  spaces?: Space[];
  onSwitchSpace?: (id: string) => void;
  onCreateSpace?: (name: string) => Promise<void>;
  onJoinSpace?: (token: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const { token, logout } = useAuth();
  // Le salon vit en state : renommage/fuseau immédiats + sync via WebSocket.
  const [space, setSpace] = useState<Space>(initialSpace);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  // Domaines extraits en hooks (état + refetch stable + mutations). SpaceApp
  // garde l'orchestration : chargement initial groupé, gate `ready`, WS, resync.
  const {
    posts,
    postsHasMore,
    postsLoadingMore,
    refetch: refetchPosts,
    loadMore: loadMorePosts,
    add: addPostH,
    edit: editPostH,
    remove: removePost,
    publish: publishPost,
    toggleReaction,
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
  } = usePosts(space.id);
  const {
    challenges,
    hasMore: challengesHasMore,
    loadingMore: challengesLoadingMore,
    refetch: refetchChallenges,
    loadMore: loadMoreChallenges,
    add: addChallengeH,
    transition,
    edit: editChallengeH,
    remove: removeChallenge,
  } = useChallenges(space.id);
  const {
    moods,
    refetch: refetchMoods,
    setMood,
    clearMood,
  } = useMoods(space.id, user.id, space.blindMood);
  const { seen, refetch: refetchSeen, markSeen } = useSeen(space.id, user.id);

  // Notices de salon (#84/#85) : petits messages affichés au dashboard. `refetch`
  // stable (déps `[space.id]`) pour être appelé depuis le WS / la resync.
  const [notices, setNotices] = useState<Notice[]>([]);
  const refetchNotices = useCallback(() => {
    api
      .listNotices(space.id)
      .then(setNotices)
      .catch(() => {});
  }, [space.id]);
  // « Vu » des notices figé à l'arrivée : les notices plus récentes s'affichent
  // toute la session, même après markSeen (disparaissent au prochain lancement).
  const [noticesSeenAt, setNoticesSeenAt] = useState<string | null>(null);
  const noticesSnapped = useRef(false);

  // Banque de propositions : domaine autonome, extrait dans son propre hook.
  const {
    suggestions,
    add: addSuggestion,
    edit: editSuggestion,
    remove: removeSuggestion,
    setHidden: setSuggestionHidden,
  } = useSuggestions(space.id, lang);
  const [openSheet, setOpenSheet] = useState<"post" | "challenge" | null>(null);
  // Brouillon en cours d'édition (sinon la feuille "post" crée un nouveau post).
  const [editingPost, setEditingPost] = useState<ApiPost | null>(null);
  // Défi en cours d'édition (sinon la feuille "challenge" en crée un nouveau).
  const [editingChallenge, setEditingChallenge] = useState<ApiChallenge | null>(
    null,
  );

  // Invitation (SEC-005) : token généré à la demande, partagé au partenaire.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const createInvite = async () => {
    try {
      const { token } = await api.createInvite(space.id);
      setInviteToken(token);
    } catch (e) {
      console.error("création d'invitation échouée", e);
    }
  };

  // Réglages / notifications.
  const [showSettings, setShowSettings] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [notifMode, setNotifMode] = useState<NotifMode>("ghost");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  // Préférence d'apparence (par appareil) : effet "braise" des états chauds.
  const [hotAnim, setHotAnim] = useState(
    () => localStorage.getItem("pp_hot_anim") !== "off",
  );

  // Onglet courant lu par le WS (sans recréer la connexion).
  const tabRef = useRef<TabId>(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Snapshot du « dernier vu » figé à l'arrivée sur l'onglet : il positionne la
  // ligne « non lus ». Marquer le fil comme vu (ci-dessous) ne doit pas la faire
  // disparaître — elle reste jusqu'au prochain retour sur l'onglet. On lit le
  // « vu » courant via une ref pour ne pas recréer l'effet à chaque refetch.
  const seenRef = useRef(seen);
  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);
  const [blogDividerAt, setBlogDividerAt] = useState<string | null>(null);
  const [challDividerAt, setChallDividerAt] = useState<string | null>(null);

  // En ouvrant le Blog ou les Défis, on fige le « vu » courant puis on marque le
  // fil comme vu.
  useEffect(() => {
    if (!ready) return;
    const snap = (feature: "blog" | "challenges") =>
      seenRef.current.find(
        (s) => s.userId === user.id && s.feature === feature,
      )?.seenAt ?? null;
    if (tab === "blog") {
      setBlogDividerAt(snap("blog"));
      markSeen("blog");
    } else if (tab === "challenges") {
      setChallDividerAt(snap("challenges"));
      markSeen("challenges");
    }
  }, [tab, ready, markSeen, user.id]);

  // Notices : on fige le « vu » UNE fois prêt (le dashboard est l'écran d'entrée)
  // puis on marque vu. Les notices arrivées depuis restent affichées la session.
  useEffect(() => {
    if (!ready || noticesSnapped.current) return;
    noticesSnapped.current = true;
    setNoticesSeenAt(
      seenRef.current.find(
        (s) => s.userId === user.id && s.feature === "notices",
      )?.seenAt ?? null,
    );
    markSeen("notices");
  }, [ready, markSeen, user.id]);

  // Chargement initial groupé : membres + réglages (locaux à SpaceApp) et les
  // refetch des domaines. `ready` bascule quand tout est settled (les refetch
  // avalent leurs erreurs → un domaine en échec ne bloque pas les autres).
  useEffect(() => {
    let alive = true;
    Promise.all([
      api
        .members(space.id)
        .then((m) => {
          if (alive) setMembers(m);
        })
        .catch(() => {}),
      refetchMoods(),
      refetchPosts(),
      refetchChallenges(),
      refetchSeen(),
      refetchNotices(),
      api
        .getSettings()
        .then((s) => {
          if (alive) setNotifMode(s.notifMode);
        })
        .catch(() => {}),
    ]).finally(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [
    space.id,
    refetchMoods,
    refetchPosts,
    refetchChallenges,
    refetchSeen,
    refetchNotices,
  ]);

  // Applique la préférence "effet braise" globalement (classe sur <html>) + persiste.
  useEffect(() => {
    document.documentElement.classList.toggle("no-hot-anim", !hotAnim);
    localStorage.setItem("pp_hot_anim", hotAnim ? "on" : "off");
  }, [hotAnim]);

  // WebSocket de refresh temps réel : à chaque mutation d'un autre membre, on
  // refetch la liste concernée (l'événement ne porte qu'un `kind`). Le cycle de
  // vie de la socket (reconnexion, nettoyage) est dans `useSpaceSocket`.
  useSpaceSocket(space.id, token, (kind) => {
    if (kind === "post" || kind === "reaction" || kind === "comment") {
      refetchPosts();
      if (kind === "comment") refetchOpenComments();
      // Si je regarde déjà le blog, le nouveau contenu est "vu".
      if (kind === "post" && tabRef.current === "blog") markSeen("blog");
    } else if (kind === "challenge") {
      refetchChallenges();
      if (tabRef.current === "challenges") markSeen("challenges");
    } else if (kind === "mood") {
      refetchMoods();
    } else if (kind === "seen") {
      refetchSeen();
    } else if (kind === "space") {
      api
        .mySpaces()
        .then((list) => {
          const s = list.find((x) => x.id === space.id);
          if (s) setSpace(s);
        })
        .catch(() => {});
      // Jointure d'un membre / activation du download → notice (#84/#85).
      refetchNotices();
    }
  });

  // Au retour sur l'app (focus / onglet redevenu visible), on resynchronise les
  // données manquées pendant l'absence (le WS ne rejoue pas l'historique).
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      refetchPosts();
      refetchChallenges();
      refetchMoods();
      refetchSeen();
      refetchNotices();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [refetchPosts, refetchChallenges, refetchMoods, refetchSeen, refetchNotices]);

  // Retour Android / swipe iOS ferment la surface ouverte (au lieu de quitter).
  useBackClose(showSettings, () => setShowSettings(false));
  useBackClose(showBank, () => setShowBank(false));
  useBackClose(openSheet !== null, () => {
    setOpenSheet(null);
    setEditingPost(null);
    setEditingChallenge(null);
  });
  useBackClose(commentsFor !== null, closeComments);

  // Dérivés mémoïsés (REACT-04) — AVANT tout `return` conditionnel (règle des
  // hooks). `toPostData` instancie un Intl.RelativeTimeFormat par post : on évite
  // de le refaire à chaque rendu (changement d'onglet, ouverture de feuille…).
  // Multi-partenaires (#52) : les AUTRES membres (≥ 0). Couple = exactement 1.
  const partners = members.filter((m) => m.id !== user.id);
  // Chaque autre membre + son dernier « vu » du blog → accusé de lecture
  // nominatif (qui a vu mes posts). Mémoïsé pour stabiliser la dépendance du
  // useMemo de `postData` (sinon nouveau tableau à chaque rendu).
  const partnersSeen = useMemo(
    () =>
      members
        .filter((m) => m.id !== user.id)
        .map((m) => ({
          name: m.displayName,
          seenAt: seen.find((s) => s.userId === m.id && s.feature === "blog")
            ?.seenAt,
        })),
    [members, seen, user.id],
  );
  const postData = useMemo<PostData[]>(
    () =>
      toPostData(posts, {
        t,
        spaceId: space.id,
        userId: user.id,
        partnersSeen,
        blogSeenAt: blogDividerAt,
      }),
    [posts, t, space.id, user.id, partnersSeen, blogDividerAt],
  );
  const challengeData = useMemo<ChallengeData[]>(
    () => toChallengeData(challenges, user.id, challDividerAt),
    [challenges, user.id, challDividerAt],
  );
  const commentViews = useMemo(
    // Même snapshot figé que le blog (#76) : un commentaire de l'autre arrivé
    // depuis mon dernier passage au blog est « non lu ».
    () => toCommentViews(comments, user.id, blogDividerAt),
    [comments, user.id, blogDividerAt],
  );

  if (!ready) return <Splash message={t("splash.loadingSpace")} />;

  // Notices non vues (#84/#85) : plus récentes que mon « vu » figé à l'arrivée.
  const dashboardNotices = toDashboardNotices(notices, noticesSeenAt);

  const myMood = moods.find((m) => m.userId === user.id)?.status ?? null;
  // Carte météo de chaque autre membre. En « surprise mutuelle », tant que je
  // n'ai pas voté le statut des autres est vidé par l'API → on masque (cache
  // flouté) ceux qui ont voté ; les autres restent « pas encore d'humeur ».
  const partnerCards = partners.map((p) => {
    const entry = moods.find((m) => m.userId === p.id);
    const voted = !!entry;
    return {
      id: p.id,
      name: p.displayName,
      glyph: p.displayName.charAt(0),
      mood: entry?.status ?? null,
      timeLabel: entry ? relativeTime(entry.updatedAt) : undefined,
      moodHidden: space.blindMood && !myMood && voted,
    };
  });

  // ----- "Vu" : badges nouveautés + accusés de lecture -----
  const seenAt = (userId: string, feature: string) =>
    seen.find((s) => s.userId === userId && s.feature === feature)?.seenAt;
  const myBlogSeen = seenAt(user.id, "blog");
  const myChallSeen = seenAt(user.id, "challenges");

  // Nouveautés = contenu de l'autre, créé après mon dernier "vu".
  const newPosts = posts.filter(
    (p) =>
      !p.draft &&
      p.authorId !== user.id &&
      (!myBlogSeen || p.createdAt > myBlogSeen),
  ).length;
  // Cohérent avec le diviseur « non lus » des défis, qui ne marque QUE la section
  // « Proposés » (REACT2-07) : un défi déjà accepté/terminé n'est plus « nouveau ».
  const newChallenges = challenges.filter(
    (c) =>
      c.status === "proposed" &&
      c.proposerId !== user.id &&
      (!myChallSeen || c.createdAt > myChallSeen),
  ).length;
  // Posts ayant reçu un commentaire de l'autre depuis mon dernier passage au blog.
  const newComments = posts.filter(
    (p) => p.lastCommentAt && (!myBlogSeen || p.lastCommentAt > myBlogSeen),
  ).length;

  // Handlers fins : les mutations vivent dans les hooks de domaine ; SpaceApp ne
  // garde que la fermeture de feuille (succès) et la confirmation de suppression.
  const addPost = async (draft: PostDraft) => {
    if (await addPostH(draft)) setOpenSheet(null);
  };

  const editPost = async (postId: string, draft: PostDraft) => {
    if (await editPostH(postId, draft)) {
      setOpenSheet(null);
      setEditingPost(null);
    }
  };

  const deletePost = (postId: string) => {
    if (confirmAction(t("blog.confirmDelete"))) removePost(postId);
  };

  const addChallenge = async (draft: ChallengeDraft) => {
    if (await addChallengeH(draft)) setOpenSheet(null);
  };

  const editChallenge = async (id: string, draft: ChallengeDraft) => {
    if (await editChallengeH(id, draft)) {
      setOpenSheet(null);
      setEditingChallenge(null);
    }
  };

  const deleteChallenge = (id: string) => {
    if (confirmAction(t("challenges.confirmDelete"))) removeChallenge(id);
  };

  const renameSpace = async (name: string) => {
    try {
      setSpace(await api.updateSpace(space.id, { name }));
    } catch (e) {
      console.error("renommage du salon échoué", e);
    }
  };

  const changeTimezone = async (timezone: string) => {
    try {
      setSpace(await api.updateSpace(space.id, { timezone }));
    } catch (e) {
      console.error("changement de fuseau échoué", e);
    }
  };

  const changeReactions = async (
    reactions: ReactionId[],
    allowCustomReactions: boolean,
  ) => {
    try {
      setSpace(
        await api.updateSpace(space.id, { reactions, allowCustomReactions }),
      );
    } catch (e) {
      console.error("changement des réactions échoué", e);
    }
  };

  const changeBlindMood = async (blindMood: boolean) => {
    try {
      setSpace(await api.updateSpace(space.id, { blindMood }));
      // Mon vote conditionne la visibilité du mood partenaire : on resynchronise.
      refetchMoods();
    } catch (e) {
      console.error("changement du mode mystère échoué", e);
    }
  };

  const changeAllowMediaDownload = async (allowMediaDownload: boolean) => {
    try {
      setSpace(await api.updateSpace(space.id, { allowMediaDownload }));
    } catch (e) {
      console.error("changement du téléchargement médias échoué", e);
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
      <div className="mx-auto h-dvh max-w-md overflow-y-auto overscroll-contain bg-charcoal-900 bg-felt-velvet px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <SettingsScreen
          notifMode={notifMode}
          onModeChange={changeNotifMode}
          pushSupported={pushSupported()}
          pushError={pushError}
          busy={settingsBusy}
          hotAnimEnabled={hotAnim}
          onHotAnimChange={setHotAnim}
          space={{
            name: space.name,
            timezone: space.timezone,
            blindMood: space.blindMood,
            allowMediaDownload: space.allowMediaDownload,
          }}
          members={members.map((m) => ({ id: m.id, name: m.displayName }))}
          inviteToken={inviteToken}
          onCreateInvite={createInvite}
          spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
          currentSpaceId={space.id}
          onSwitchSpace={onSwitchSpace}
          onCreateSpace={onCreateSpace}
          onJoinSpace={onJoinSpace}
          onRenameSpace={renameSpace}
          onTimezoneChange={changeTimezone}
          onBlindMoodChange={changeBlindMood}
          onAllowMediaDownloadChange={changeAllowMediaDownload}
          reactions={space.reactions}
          allowCustomReactions={space.allowCustomReactions}
          onReactionsChange={changeReactions}
          onBack={() => setShowSettings(false)}
          onLogout={logout}
          onLogoutAll={async () => {
            if (!confirmAction(t("settings.logoutAllConfirm"))) return;
            try {
              await api.logoutAll();
            } catch (e) {
              console.error("révocation des sessions échouée", e);
            }
            logout();
          }}
        />
      </div>
    );
  }

  if (showBank) {
    return (
      <div className="mx-auto h-dvh max-w-md overflow-y-auto overscroll-contain bg-charcoal-900 bg-felt-velvet px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <ChallengeBankScreen
          suggestions={suggestions.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            intensity: s.intensity,
            isOwn: s.spaceId !== null,
            done: s.done,
            hidden: s.hidden,
          }))}
          onPropose={async (s, sourceId) => {
            // Proposer depuis la banque = créer un défi « proposed » (#62) en
            // gardant le lien vers la suggestion d'origine (#69).
            if (await addChallengeH(s, sourceId)) {
              setShowBank(false);
              setTab("challenges");
            }
          }}
          onAdd={addSuggestion}
          onUpdate={editSuggestion}
          onDelete={removeSuggestion}
          onSetHidden={setSuggestionHidden}
          onBack={() => setShowBank(false)}
        />
      </div>
    );
  }


  return (
    <AppShell
      active={tab}
      onTabChange={setTab}
      badges={{ blog: newPosts, challenges: newChallenges }}
    >
      {tab === "dashboard" && (
        <DashboardScreen
          spaceName={space.name}
          partners={partnerCards}
          inviteToken={inviteToken}
          onCreateInvite={createInvite}
          myMood={myMood}
          onMoodChange={setMood}
          onMoodClear={clearMood}
          onOpenSettings={() => setShowSettings(true)}
          newPosts={newPosts}
          newComments={newComments}
          newChallenges={newChallenges}
          notices={dashboardNotices}
          onOpen={setTab}
        />
      )}

      {tab === "blog" && (
        <BlogScreen
          posts={postData}
          hasMore={postsHasMore}
          loadingMore={postsLoadingMore}
          onLoadMore={loadMorePosts}
          onCompose={() => setOpenSheet("post")}
          onToggleReaction={toggleReaction}
          onOpenComments={openComments}
          reactionOrder={space.reactions}
          allowCustomReactions={space.allowCustomReactions}
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
          hasMore={challengesHasMore}
          loadingMore={challengesLoadingMore}
          onLoadMore={loadMoreChallenges}
          onNew={() => setOpenSheet("challenge")}
          onOpenBank={() => setShowBank(true)}
          onAccept={(id) => transition(id, "challengeAccepted")}
          onNegotiate={(id) => transition(id, "maybeMaybe")}
          onComplete={(id) => transition(id, "jobDone")}
          onEdit={(id) => {
            const c = challenges.find((x) => x.id === id);
            if (c) {
              setEditingChallenge(c);
              setOpenSheet("challenge");
            }
          }}
          onDelete={deleteChallenge}
        />
      )}

      <Sheet
        open={openSheet === "post"}
        title={editingPost ? t("postComposer.sheetEdit") : t("postComposer.sheetWrite")}
        // En édition, on s'offre de la place pour rédiger (≈ 3/4 d'écran).
        className={editingPost ? "min-h-[75dvh]" : undefined}
        onClose={() => {
          setOpenSheet(null);
          setEditingPost(null);
        }}
      >
        <PostComposer
          key={editingPost?.id ?? "new"}
          // Toggle « téléchargeable » : valeur du post en édition, sinon le
          // défaut du salon (#78).
          defaultAllowDownload={
            editingPost ? editingPost.allowDownload : space.allowMediaDownload
          }
          initial={
            editingPost
              ? {
                  title: editingPost.title ?? undefined,
                  body: editingPost.body,
                  draft: editingPost.draft,
                  media: editingPost.mediaId
                    ? {
                        viewOnce: editingPost.mediaViewOnce ?? false,
                        kind: editingPost.mediaMime?.startsWith("video/")
                          ? "video"
                          : "image",
                        alt: t("postComposer.attachedAlt"),
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
        title={
          editingChallenge
            ? t("challengeComposer.sheetEdit")
            : t("challengeComposer.sheetTitle")
        }
        onClose={() => {
          setOpenSheet(null);
          setEditingChallenge(null);
        }}
      >
        <ChallengeComposer
          key={editingChallenge?.id ?? "new"}
          initial={
            editingChallenge
              ? {
                  title: editingChallenge.title,
                  description: editingChallenge.description,
                  intensity: editingChallenge.intensity,
                  deadlineLabel: editingChallenge.deadlineLabel ?? undefined,
                }
              : undefined
          }
          onSubmit={
            editingChallenge
              ? (d) => editChallenge(editingChallenge.id, d)
              : addChallenge
          }
          onCancel={() => {
            setOpenSheet(null);
            setEditingChallenge(null);
          }}
          // Les idées masquées (#70) sortent des inspirations du composer.
          suggestions={suggestions.filter((s) => !s.hidden)}
        />
      </Sheet>

      <CommentsSheet
        // Remonté à chaque changement de post (REACT2-02) : réinitialise le
        // brouillon de réponse / l'édition en cours (sinon ils fuient d'un post
        // à l'autre).
        key={commentsFor ?? "closed"}
        open={commentsFor !== null}
        comments={commentViews}
        loading={commentsLoading}
        busy={commentBusy}
        hasMore={commentsHasMore}
        loadingMore={commentsLoadingMore}
        onLoadMore={loadMoreComments}
        onAdd={addComment}
        onEdit={editComment}
        onDelete={(id) => {
          if (confirmAction(t("comments.confirmDelete"))) removeComment(id);
        }}
        onClose={closeComments}
      />
    </AppShell>
  );
}
