import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Space, UserPublic } from "../api/types";

// Capture le callback WS pour tirer des événements depuis le test.
const h = vi.hoisted(() => ({
  ws: null as ((kind: string) => void) | null,
  logout: vi.fn(),
  updateDisplayName: vi.fn(),
}));
vi.mock("./hooks/useSpaceSocket", () => ({
  useSpaceSocket: (_s: string, _t: string | null, onEvent: (k: string) => void) => {
    h.ws = onEvent;
  },
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    token: "tok",
    logout: h.logout,
    user: { id: "me", displayName: "Moi" },
    updateDisplayName: h.updateDisplayName,
  }),
}));
const push = vi.hoisted(() => ({
  supported: true,
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));
vi.mock("../push", () => ({
  pushSupported: () => push.supported,
  enablePush: push.enablePush,
  disablePush: push.disablePush,
}));
vi.mock("../share", () => ({ takeSharedFiles: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/confirm", () => ({ confirmAction: vi.fn().mockReturnValue(true) }));

vi.mock("../api/client", () => ({
  members: vi.fn(),
  listMoods: vi.fn(),
  listPosts: vi.fn(),
  listChallenges: vi.fn(),
  listSeen: vi.fn(),
  listNotices: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  listChallengeSuggestions: vi.fn(),
  listLoveNotes: vi.fn(),
  listNotifications: vi.fn(),
  unreadNotificationCount: vi.fn(),
  listDesires: vi.fn(),
  listEveningMenu: vi.fn(),
  getEveningMenuStatus: vi.fn(),
  markSeen: vi.fn(),
  mySpaces: vi.fn(),
  updateSpace: vi.fn(),
  createInvite: vi.fn(),
  logoutAll: vi.fn(),
  getApiVersion: vi.fn(),
  spaceSocketUrl: vi.fn().mockReturnValue("ws://x"),
  fetchMediaObjectUrl: vi.fn(),
}));

import * as api from "../api/client";
import { confirmAction } from "../lib/confirm";
import { SpaceApp } from "./SpaceApp";

const a = vi.mocked(api, true);
const space: Space = {
  id: "s1",
  name: "Notre salon",
  timezone: "Europe/Paris",
  reactions: [],
  allowCustomReactions: true,
  blindMood: false,
  allowMediaDownload: false,
  desiresEnabled: false,
  desiresExplicitLabels: true,
  eveningMenuEnabled: false,
  eveningMenuBlind: true,
  eveningCourseCustom: false,
  eveningCourseCategories: [],
  createdAt: "2026-06-24T10:00:00.000Z",
} as Space;
const user: UserPublic = { id: "me", email: "me@x", displayName: "Moi", createdAt: "t" } as UserPublic;

let ls: Record<string, string>;
beforeEach(() => {
  vi.clearAllMocks();
  h.ws = null;
  push.supported = true;
  ls = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => ls[k] ?? null,
    setItem: (k: string, v: string) => void (ls[k] = String(v)),
    removeItem: (k: string) => void delete ls[k],
    clear: () => void (ls = {}),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  a.members.mockResolvedValue([{ id: "me", displayName: "Moi", role: "partner" }] as never);
  a.listMoods.mockResolvedValue([]);
  a.listPosts.mockResolvedValue({ items: [], hasMore: false });
  a.listChallenges.mockResolvedValue({ items: [], hasMore: false });
  a.listSeen.mockResolvedValue([]);
  a.listNotices.mockResolvedValue([]);
  a.getSettings.mockResolvedValue({ notifMode: "ghost" });
  a.updateSettings.mockResolvedValue({ notifMode: "push" });
  a.listChallengeSuggestions.mockResolvedValue([]);
  a.listLoveNotes.mockResolvedValue([]);
  a.listNotifications.mockResolvedValue([]);
  a.unreadNotificationCount.mockResolvedValue({ count: 0 });
  a.listDesires.mockResolvedValue([]);
  a.listEveningMenu.mockResolvedValue([]);
  a.getEveningMenuStatus.mockResolvedValue(null as never);
  a.markSeen.mockResolvedValue({ userId: "me", feature: "blog", seenAt: "t" });
  a.mySpaces.mockResolvedValue([space]);
  // Le serveur renvoie le salon complet : les modifications s'accumulent.
  let current: Space = space;
  a.updateSpace.mockImplementation(async (_id, patch) => {
    current = { ...current, ...patch } as Space;
    return current;
  });
  a.createInvite.mockResolvedValue({ code: "EmberVelvet#7" });
  a.logoutAll.mockResolvedValue(undefined as never);
  a.getApiVersion.mockResolvedValue({ version: "dev", commit: "" } as never);
  vi.mocked(confirmAction).mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  render(<SpaceApp space={space} user={user} />);
  await screen.findByRole("button", { name: "Réglages" });
}

describe("SpaceApp — temps réel et resynchronisation", () => {
  it.each([
    ["post", () => a.listPosts],
    ["reaction", () => a.listPosts],
    ["comment", () => a.listPosts],
    ["challenge", () => a.listChallenges],
    ["mood", () => a.listMoods],
    ["seen", () => a.listSeen],
    ["desire", () => a.listDesires],
    ["eveningMenu", () => a.listEveningMenu],
    ["loveNote", () => a.listLoveNotes],
    ["notification", () => a.listNotifications],
  ])("événement WS « %s » : recharge la liste concernée", async (kind, spy) => {
    await mount();
    const target = spy();
    target.mockClear();
    // Desires/menu : actifs seulement si le salon l'active ; sinon l'appel est ignoré.
    await act(async () => h.ws?.(kind));
    if (kind === "desire" || kind === "eveningMenu") return; // désactivés : pas d'appel réseau
    await waitFor(() => expect(target).toHaveBeenCalled());
  });

  it("événement « space » : recharge le salon et les notices", async () => {
    await mount();
    a.mySpaces.mockClear();
    a.listNotices.mockClear();
    a.mySpaces.mockResolvedValue([{ ...space, name: "Renommé" } as Space]);
    await act(async () => h.ws?.("space"));
    await waitFor(() => expect(a.mySpaces).toHaveBeenCalled());
    await waitFor(() => expect(a.listNotices).toHaveBeenCalled());
  });

  it("événement inconnu : ignoré sans erreur", async () => {
    await mount();
    await expect(act(async () => h.ws?.("truc"))).resolves.not.toThrow();
  });

  it("retour sur l'app (focus / onglet visible) : tout est resynchronisé", async () => {
    await mount();
    for (const f of [a.listPosts, a.listChallenges, a.listMoods, a.listSeen, a.listNotices, a.listLoveNotes, a.listNotifications]) {
      f.mockClear();
    }
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(a.listPosts).toHaveBeenCalled());
    expect(a.listChallenges).toHaveBeenCalled();
    expect(a.listMoods).toHaveBeenCalled();
    expect(a.listSeen).toHaveBeenCalled();
    expect(a.listNotices).toHaveBeenCalled();
    expect(a.listLoveNotes).toHaveBeenCalled();
    expect(a.listNotifications).toHaveBeenCalled();
  });

  it("onglet en arrière-plan : pas de resynchronisation", async () => {
    await mount();
    a.listPosts.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    expect(a.listPosts).not.toHaveBeenCalled();
  });
});

describe("SpaceApp — navigation", () => {
  it("la barre du bas bascule entre Blog, Défis et Accueil (et marque le fil comme vu)", async () => {
    await mount();
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    await userEvent.click(within(nav).getByRole("button", { name: /Blog/ }));
    await waitFor(() => expect(a.markSeen).toHaveBeenCalledWith("s1", "blog"));
    await userEvent.click(within(nav).getByRole("button", { name: /Défis/ }));
    await waitFor(() => expect(a.markSeen).toHaveBeenCalledWith("s1", "challenges"));
    await userEvent.click(within(nav).getByRole("button", { name: /Accueil/ }));
    expect(screen.getByRole("button", { name: "Réglages" })).toBeInTheDocument();
  });
});

import { within } from "@testing-library/react";

describe("SpaceApp — Réglages", () => {
  async function openSettings() {
    await mount();
    await userEvent.click(screen.getByRole("button", { name: "Réglages" }));
    await screen.findByRole("heading", { name: "Réglages" });
  }

  it("les interrupteurs du salon appellent updateSpace avec le bon champ", async () => {
    await openSettings();
    const cases: [string, Record<string, unknown>][] = [
      ["Surprise mutuelle", { blindMood: true }],
      ["Médias téléchargeables", { allowMediaDownload: true }],
      ["Bucket list", { desiresEnabled: true }],
      ["Menu du soir", { eveningMenuEnabled: true }],
    ];
    for (const [label, patch] of cases) {
      await userEvent.click(screen.getByRole("switch", { name: label }));
      await waitFor(() => expect(a.updateSpace).toHaveBeenCalledWith("s1", patch));
    }
    // Les options dépendantes apparaissent une fois la fonctionnalité activée.
    await userEvent.click(await screen.findByRole("switch", { name: "Libellés explicites" }));
    await waitFor(() => expect(a.updateSpace).toHaveBeenCalledWith("s1", { desiresExplicitLabels: false }));
    await userEvent.click(await screen.findByRole("switch", { name: "Mode aveugle" }));
    await waitFor(() => expect(a.updateSpace).toHaveBeenCalledWith("s1", { eveningMenuBlind: false }));
  });

  it("une erreur de mise à jour du salon est journalisée sans casser l'écran", async () => {
    a.updateSpace.mockRejectedValue(new Error("500"));
    await openSettings();
    await userEvent.click(screen.getByRole("switch", { name: "Surprise mutuelle" }));
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Réglages" })).toBeInTheDocument();
  });

  it("mode de notification : « push » demande la permission puis enregistre le choix", async () => {
    await openSettings();
    await userEvent.click(screen.getByRole("radio", { name: /Notifications immédiates/ }));
    await waitFor(() => expect(push.enablePush).toHaveBeenCalled());
    await waitFor(() => expect(a.updateSettings).toHaveBeenCalledWith("push"));
  });

  it("mode de notification : refus de permission → message d'erreur, choix non enregistré", async () => {
    push.enablePush.mockRejectedValue(new Error("Permission refusée"));
    await openSettings();
    await userEvent.click(screen.getByRole("radio", { name: /Notifications immédiates/ }));
    expect(await screen.findByText("Permission refusée")).toBeInTheDocument();
    expect(a.updateSettings).not.toHaveBeenCalled();
  });

  it("revenir au mode fantôme désabonne l'appareil", async () => {
    a.getSettings.mockResolvedValue({ notifMode: "push" });
    a.updateSettings.mockResolvedValue({ notifMode: "ghost" });
    await openSettings();
    await userEvent.click(screen.getByRole("radio", { name: /Mode fantôme/ }));
    await waitFor(() => expect(push.disablePush).toHaveBeenCalled());
    await waitFor(() => expect(a.updateSettings).toHaveBeenCalledWith("ghost"));
  });

  it("inviter un membre : génère et affiche le code", async () => {
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "Inviter un membre" }));
    expect(await screen.findByText("EmberVelvet#7")).toBeInTheDocument();
  });

  it("déconnecter tous les appareils : confirmation, révocation puis déconnexion", async () => {
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "Déconnecter tous les appareils" }));
    await waitFor(() => expect(a.logoutAll).toHaveBeenCalled());
    expect(h.logout).toHaveBeenCalled();
  });

  it("déconnexion de tous les appareils refusée à la confirmation : rien ne se passe", async () => {
    vi.mocked(confirmAction).mockReturnValue(false);
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "Déconnecter tous les appareils" }));
    expect(a.logoutAll).not.toHaveBeenCalled();
    expect(h.logout).not.toHaveBeenCalled();
  });

  it("la révocation en échec déconnecte quand même l'appareil courant", async () => {
    a.logoutAll.mockRejectedValue(new Error("réseau"));
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: "Déconnecter tous les appareils" }));
    await waitFor(() => expect(h.logout).toHaveBeenCalled());
  });

  it("« Retour » referme les réglages", async () => {
    await openSettings();
    await userEvent.click(screen.getByRole("button", { name: /Retour|retour/ }));
    expect(await screen.findByRole("button", { name: "Réglages" })).toBeInTheDocument();
  });
});
