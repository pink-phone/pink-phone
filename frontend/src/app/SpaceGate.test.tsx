import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { Space } from "../api/types";
import { SpaceGate } from "./SpaceGate";
import { CURRENT_SPACE_KEY } from "./currentSpace";

vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  mySpaces: vi.fn(),
  createSpace: vi.fn(),
  joinByInvite: vi.fn(),
}));
const logout = vi.fn();
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ logout }) }));
// SpaceApp est testé à part : on expose juste ce que SpaceGate lui passe.
vi.mock("./SpaceApp", () => ({
  SpaceApp: (p: {
    space: Space;
    spaces: Space[];
    onSwitchSpace: (id: string) => void;
    onCreateSpace: (n: string) => Promise<void>;
    onJoinSpace: (c: string) => Promise<void>;
  }) => (
    <div>
      <p>app:{p.space.id}</p>
      <p>count:{p.spaces.length}</p>
      <button type="button" onClick={() => p.onSwitchSpace("s2")}>switch</button>
      <button type="button" onClick={() => void p.onCreateSpace("Nouveau")}>create</button>
      <button type="button" onClick={() => void p.onJoinSpace(" CODE#1 ")}>join</button>
    </div>
  ),
}));

const a = vi.mocked(api, true);
const USER = { id: "u1", email: "a@x.test", displayName: "Alex", createdAt: "2026-01-01T00:00:00Z" };
const space = (id: string): Space =>
  ({ id, name: id, timezone: "Europe/Paris" }) as unknown as Space;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("SpaceGate", () => {
  it("charge les salons puis monte l'app sur le premier", async () => {
    a.mySpaces.mockResolvedValue([space("s1"), space("s2")]);
    render(<SpaceGate user={USER} />);
    expect(await screen.findByText("app:s1")).toBeInTheDocument();
    expect(screen.getByText("count:2")).toBeInTheDocument();
  });

  it("reprend le salon mémorisé s'il existe encore", async () => {
    localStorage.setItem(CURRENT_SPACE_KEY, "s2");
    a.mySpaces.mockResolvedValue([space("s1"), space("s2")]);
    render(<SpaceGate user={USER} />);
    expect(await screen.findByText("app:s2")).toBeInTheDocument();
  });

  it("bascule de salon : mémorise le choix", async () => {
    a.mySpaces.mockResolvedValue([space("s1"), space("s2")]);
    render(<SpaceGate user={USER} />);
    await userEvent.click(await screen.findByText("switch"));
    expect(await screen.findByText("app:s2")).toBeInTheDocument();
    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe("s2");
  });

  it("créer un autre salon depuis l'app : ajouté et sélectionné", async () => {
    a.mySpaces.mockResolvedValue([space("s1")]);
    a.createSpace.mockResolvedValue(space("s9"));
    render(<SpaceGate user={USER} />);
    await userEvent.click(await screen.findByText("create"));
    expect(await screen.findByText("app:s9")).toBeInTheDocument();
    expect(a.createSpace).toHaveBeenCalledWith("Nouveau");
    expect(screen.getByText("count:2")).toBeInTheDocument();
  });

  it("rejoindre un salon : code nettoyé, pas de doublon si déjà membre", async () => {
    a.mySpaces.mockResolvedValue([space("s1")]);
    a.joinByInvite.mockResolvedValue(space("s1")); // déjà membre
    render(<SpaceGate user={USER} />);
    await userEvent.click(await screen.findByText("join"));
    await waitFor(() => expect(a.joinByInvite).toHaveBeenCalledWith("CODE#1"));
    expect(screen.getByText("count:1")).toBeInTheDocument();
  });

  it("aucun salon : onboarding ; créer en ouvre un", async () => {
    a.mySpaces.mockResolvedValue([]);
    a.createSpace.mockResolvedValue(space("n1"));
    render(<SpaceGate user={USER} />);
    expect(
      await screen.findByRole("heading", { name: "Bienvenue, Alex" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByText("app:n1")).toBeInTheDocument();
    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe("n1");
  });

  it("onboarding : rejoindre par code ; une erreur API s'affiche", async () => {
    a.mySpaces.mockResolvedValue([]);
    a.joinByInvite.mockRejectedValueOnce(new ApiError(400, "invitation invalide"));
    a.joinByInvite.mockResolvedValueOnce(space("j1"));
    render(<SpaceGate user={USER} />);
    const field = await screen.findByLabelText("Code d'invitation");
    await userEvent.type(field, " MAUVAIS ");
    await userEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
    expect(await screen.findByText("invitation invalide")).toBeInTheDocument();
    expect(a.joinByInvite).toHaveBeenCalledWith("MAUVAIS");

    await userEvent.clear(field);
    await userEvent.type(field, "BON#1");
    await userEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
    expect(await screen.findByText("app:j1")).toBeInTheDocument();
  });

  it("onboarding : création en échec → message générique si l'erreur n'est pas une ApiError", async () => {
    a.mySpaces.mockResolvedValue([]);
    a.createSpace.mockRejectedValue(new Error("boom"));
    render(<SpaceGate user={USER} />);
    await userEvent.click(await screen.findByRole("button", { name: "Créer" }));
    expect(await screen.findByText("une erreur est survenue")).toBeInTheDocument();
  });

  it("liste des salons impossible à charger : traité comme « aucun salon »", async () => {
    a.mySpaces.mockRejectedValue(new Error("réseau"));
    render(<SpaceGate user={USER} />);
    expect(
      await screen.findByRole("heading", { name: "Bienvenue, Alex" }),
    ).toBeInTheDocument();
  });

  it("onboarding : « se déconnecter » appelle logout", async () => {
    a.mySpaces.mockResolvedValue([]);
    render(<SpaceGate user={USER} />);
    await userEvent.click(
      await screen.findByRole("button", { name: /déconnecter/i }),
    );
    expect(logout).toHaveBeenCalled();
  });
});
