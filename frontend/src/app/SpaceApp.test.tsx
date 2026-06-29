import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import type { Space, UserPublic, Notice } from "../api/types";

// --- Mocks (hoistés au-dessus des imports par Vitest) ----------------------

// Capture le callback d'événements WS pour pouvoir le déclencher depuis le test.
const h = vi.hoisted(() => ({ ws: null as ((kind: string) => void) | null }));
vi.mock("./hooks/useSpaceSocket", () => ({
  useSpaceSocket: (
    _spaceId: string,
    _token: string | null,
    onEvent: (kind: string) => void,
  ) => {
    h.ws = onEvent;
  },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ token: "tok", logout: vi.fn() }),
}));

vi.mock("../push", () => ({
  pushSupported: () => false,
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));

// Tout le client API : valeurs par défaut « vides » pour le chargement initial.
vi.mock("../api/client", () => ({
  members: vi.fn().mockResolvedValue([]),
  listMoods: vi.fn().mockResolvedValue([]),
  listPosts: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  listChallenges: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  listSeen: vi.fn().mockResolvedValue([]),
  listNotices: vi.fn().mockResolvedValue([]),
  getSettings: vi.fn().mockResolvedValue({ notifMode: "ghost" }),
  listChallengeSuggestions: vi.fn().mockResolvedValue([]),
  markSeen: vi
    .fn()
    .mockResolvedValue({ userId: "me", feature: "notices", seenAt: "t" }),
  mySpaces: vi.fn().mockResolvedValue([]),
  spaceSocketUrl: vi.fn().mockReturnValue("ws://x"),
  fetchMediaObjectUrl: vi.fn(),
}));

import * as api from "../api/client";
import { SpaceApp } from "./SpaceApp";

// localStorage est indisponible sous Node dans cet env de test → stub mémoire
// (SpaceApp lit `pp_hot_anim` à l'init).
const lsStore: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => lsStore[k] ?? null,
  setItem: (k: string, v: string) => {
    lsStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete lsStore[k];
  },
  clear: () => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
  },
});

const space: Space = {
  id: "s1",
  name: "Notre salon",
  timezone: "Europe/Paris",
  reactions: [],
  allowCustomReactions: true,
  blindMood: false,
  allowMediaDownload: false,
  desiresEnabled: false,
  createdAt: "2026-06-24T10:00:00.000Z",
};
const user: UserPublic = {
  id: "me",
  email: "me@x",
  displayName: "Moi",
  createdAt: "2026-06-24T10:00:00.000Z",
};
const notice = (o: Partial<Notice> = {}): Notice => ({
  id: "n1",
  kind: "member_joined",
  actorId: "u2",
  actorName: "Camille",
  createdAt: "2026-06-24T11:00:00.000Z",
  ...o,
});

describe("SpaceApp — wiring des notices (#84/#85)", () => {
  beforeEach(() => {
    vi.clearAllMocks(); // efface l'historique, garde les implémentations
    h.ws = null;
    vi.mocked(api.listNotices).mockResolvedValue([notice()]);
    vi.mocked(api.mySpaces).mockResolvedValue([space]);
  });

  it("affiche le bandeau notices au montage et marque 'notices' comme vu", async () => {
    render(<SpaceApp space={space} user={user} />);
    expect(
      await screen.findByText(/Camille a rejoint le salon/i),
    ).toBeInTheDocument();
    // Snapshot figé null à l'arrivée → la notice s'affiche, ET on marque vu.
    expect(api.markSeen).toHaveBeenCalledWith("s1", "notices");
  });

  it("un événement WS 'space' refetch les notices", async () => {
    render(<SpaceApp space={space} user={user} />);
    await screen.findByText(/Camille a rejoint le salon/i);
    const before = vi.mocked(api.listNotices).mock.calls.length;

    await act(async () => {
      h.ws?.("space");
    });

    await waitFor(() =>
      expect(vi.mocked(api.listNotices).mock.calls.length).toBeGreaterThan(
        before,
      ),
    );
  });

  it("kind inconnu : pas de carte, pas de crash", async () => {
    vi.mocked(api.listNotices).mockResolvedValue([
      notice({ id: "x", kind: "totally_unknown" }),
    ]);
    render(<SpaceApp space={space} user={user} />);
    // L'app monte (le dashboard apparaît) sans afficher de notice connue.
    expect(await screen.findByText("Notre salon")).toBeInTheDocument();
    expect(screen.queryByText(/a rejoint le salon/i)).toBeNull();
  });
});
