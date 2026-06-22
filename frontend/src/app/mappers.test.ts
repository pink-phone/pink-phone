import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import { toPostData, toChallengeData, toCommentViews } from "./mappers";
import type { ApiChallenge, ApiComment, ApiPost } from "../api/types";

// `t` factice : renvoie la clé (les conversions n'ont pas besoin du vrai i18n).
const t = ((key: string) => key) as unknown as TFunction;

function post(overrides: Partial<ApiPost> = {}): ApiPost {
  return {
    id: "p1",
    authorId: "u1",
    authorName: "Alex",
    title: null,
    body: "coucou",
    mediaId: null,
    mediaViewOnce: null,
    mediaConsumed: null,
    mediaMime: null,
    draft: false,
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    reactionCounts: {},
    myReactions: [],
    verdict: null,
    commentCount: 0,
    lastCommentAt: null,
    ...overrides,
  };
}

describe("toPostData", () => {
  it("dérive author.glyph de l'initiale et title undefined si null", () => {
    const [vm] = toPostData([post({ authorName: "Camille", title: null })], {
      t,
      spaceId: "s1",
      userId: "me",
    });
    expect(vm.author).toEqual({ name: "Camille", glyph: "C" });
    expect(vm.title).toBeUndefined();
  });

  it("isMine vrai quand l'auteur est l'utilisateur courant", () => {
    const [mine] = toPostData([post({ authorId: "me" })], {
      t,
      spaceId: "s1",
      userId: "me",
    });
    const [other] = toPostData([post({ authorId: "u2" })], {
      t,
      spaceId: "s1",
      userId: "me",
    });
    expect(mine.isMine).toBe(true);
    expect(other.isMine).toBe(false);
  });

  it("edited: vrai si updatedAt > createdAt (post publié), faux sinon ou en brouillon", () => {
    const opts = { t, spaceId: "s1", userId: "me" };
    const [jamais] = toPostData([post()], opts); // updatedAt == createdAt
    const [modifie] = toPostData(
      [post({ updatedAt: "2026-06-20T11:00:00.000Z" })],
      opts,
    );
    const [brouillon] = toPostData(
      [post({ draft: true, updatedAt: "2026-06-20T11:00:00.000Z" })],
      opts,
    );
    expect(jamais.edited).toBe(false);
    expect(modifie.edited).toBe(true);
    expect(brouillon.edited).toBe(false);
  });

  it("pas de média => media undefined ; média vidéo => kind video + loader", () => {
    const [noMedia] = toPostData([post({ mediaId: null })], {
      t,
      spaceId: "s1",
      userId: "me",
    });
    expect(noMedia.media).toBeUndefined();

    const [withVideo] = toPostData(
      [post({ mediaId: "m1", mediaMime: "video/mp4", mediaViewOnce: true })],
      { t, spaceId: "s1", userId: "me" },
    );
    expect(withVideo.media?.kind).toBe("video");
    expect(withVideo.media?.viewOnce).toBe(true);
    expect(typeof withVideo.media?.loader).toBe("function");
  });

  it("seenByPartner: vrai seulement pour mon post non-draft créé avant le 'vu' du partenaire", () => {
    const base = {
      authorId: "me",
      draft: false,
      createdAt: "2026-06-20T10:00:00.000Z",
    };
    const seen = "2026-06-20T12:00:00.000Z"; // partenaire a vu après la création

    const [vm] = toPostData([post(base)], {
      t,
      spaceId: "s1",
      userId: "me",
      partnerBlogSeen: seen,
    });
    expect(vm.seenByPartner).toBe(true);

    // Créé APRÈS le dernier "vu" du partenaire => pas encore vu.
    const [after] = toPostData(
      [post({ ...base, createdAt: "2026-06-20T13:00:00.000Z" })],
      { t, spaceId: "s1", userId: "me", partnerBlogSeen: seen },
    );
    expect(after.seenByPartner).toBe(false);

    // Post du partenaire (pas le mien) => jamais d'accusé côté moi.
    const [notMine] = toPostData([post({ ...base, authorId: "u2" })], {
      t,
      spaceId: "s1",
      userId: "me",
      partnerBlogSeen: seen,
    });
    expect(notMine.seenByPartner).toBe(false);

    // Sans "vu" partenaire => false.
    const [noSeen] = toPostData([post(base)], { t, spaceId: "s1", userId: "me" });
    expect(noSeen.seenByPartner).toBe(false);
  });
});

describe("toChallengeData", () => {
  const challenge = (o: Partial<ApiChallenge> = {}): ApiChallenge => ({
    id: "c1",
    proposerId: "u2",
    title: "Défi",
    description: "desc",
    intensity: "hot",
    status: "proposed",
    deadlineLabel: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    ...o,
  });

  it("perspective = proposer si je suis le proposeur, recipient sinon", () => {
    expect(toChallengeData([challenge({ proposerId: "me" })], "me")[0].perspective).toBe(
      "proposer",
    );
    expect(toChallengeData([challenge({ proposerId: "u2" })], "me")[0].perspective).toBe(
      "recipient",
    );
  });

  it("deadlineLabel null => undefined", () => {
    expect(toChallengeData([challenge({ deadlineLabel: null })], "me")[0].deadlineLabel)
      .toBeUndefined();
  });
});

describe("toCommentViews", () => {
  it("mappe id/auteur/corps et formate l'horodatage", () => {
    const comments: ApiComment[] = [
      {
        id: "k1",
        authorId: "u2",
        authorName: "Sam",
        body: "joli",
        createdAt: "2026-06-20T10:00:00.000Z",
      },
    ];
    const [vm] = toCommentViews(comments);
    expect(vm).toMatchObject({ id: "k1", authorName: "Sam", body: "joli" });
    expect(typeof vm.timeLabel).toBe("string");
  });
});
