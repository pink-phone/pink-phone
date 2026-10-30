import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const logout = vi.fn();
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ logout }) }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  mySpaces: vi.fn(),
  createSpace: vi.fn(),
  joinByInvite: vi.fn(),
}));
vi.mock("../screens/Splash/Splash", () => ({ Splash: () => <div>splash</div> }));
vi.mock("../screens/OnboardingScreen/OnboardingScreen", () => ({
  OnboardingScreen: (p: {
    error: string | null;
    busy: boolean;
    onCreate: (n: string) => void;
    onJoin: (t: string) => void;
    onLogout: () => void;
  }) => (
    <div>
      <span data-testid="err">{p.error}</span>
      <button onClick={() => p.onCreate("Nid")}>create</button>
      <button onClick={() => p.onJoin("  CODE  ")}>join</button>
      <button onClick={p.onLogout}>logout</button>
    </div>
  ),
}));
vi.mock("./SpaceApp", () => ({
  SpaceApp: (p: {
    space: { id: string };
    spaces: { id: string }[];
    onSwitchSpace: (id: string) => void;
    onCreateSpace: (n: string) => Promise<void>;
    onJoinSpace: (t: string) => Promise<void>;
  }) => (
    <div>
      <span data-testid="current">{p.space.id}</span>
      <span data-testid="count">{p.spaces.length}</span>
      <button onClick={() => p.onSwitchSpace("s2")}>switch</button>
      <button onClick={() => void p.onCreateSpace("Autre")}>new</button>
      <button onClick={() => void p.onJoinSpace(" X ")}>joinother</button>
    </div>
  ),
}));

import * as api from "../api/client";
import { ApiError } from "../api/client";
import { SpaceGate } from "./SpaceGate";
import { CURRENT_SPACE_KEY } from "./currentSpace";

const mocked = vi.mocked(api);
const user = { id: "u", displayName: "Ana" } as never;
const sp = (id: string) => ({ id, name: id }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("SpaceGate", () => {
  it("Splash pendant le chargement des salons", () => {
    mocked.mySpaces.mockReturnValue(new Promise(() => {}));
    render(<SpaceGate user={user} />);
    expect(screen.getByText("splash")).toBeInTheDocument();
  });

  it("aucun salon (ou erreur de chargement) → onboarding", async () => {
    mocked.mySpaces.mockRejectedValue(new Error("down"));
    render(<SpaceGate user={user} />);
    expect(await screen.findByText("create")).toBeInTheDocument();
  });

  it("onboarding : créer un salon bascule dessus et le mémorise", async () => {
    mocked.mySpaces.mockResolvedValue([]);
    mocked.createSpace.mockResolvedValue(sp("new1"));
    render(<SpaceGate user={user} />);
    await userEvent.click(await screen.findByText("create"));
    expect(await screen.findByTestId("current")).toHaveTextContent("new1");
    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe("new1");
  });

  it("onboarding : rejoindre trim le code ; l'erreur API s'affiche", async () => {
    mocked.mySpaces.mockResolvedValue([]);
    mocked.joinByInvite.mockRejectedValueOnce(new ApiError(404, "code invalide"));
    render(<SpaceGate user={user} />);
    await userEvent.click(await screen.findByText("join"));
    expect(mocked.joinByInvite).toHaveBeenCalledWith("CODE");
    await waitFor(() => expect(screen.getByTestId("err")).toHaveTextContent("code invalide"));
    mocked.joinByInvite.mockResolvedValueOnce(sp("j1"));
    await userEvent.click(screen.getByText("join"));
    expect(await screen.findByTestId("current")).toHaveTextContent("j1");
  });

  it("onboarding : erreur non-API → message générique ; logout délégué", async () => {
    mocked.mySpaces.mockResolvedValue([]);
    mocked.createSpace.mockRejectedValue(new Error("boom"));
    render(<SpaceGate user={user} />);
    await userEvent.click(await screen.findByText("create"));
    await waitFor(() => expect(screen.getByTestId("err")).not.toBeEmptyDOMElement());
    await userEvent.click(screen.getByText("logout"));
    expect(logout).toHaveBeenCalled();
  });

  it("ouvre le salon mémorisé, sinon le premier", async () => {
    localStorage.setItem(CURRENT_SPACE_KEY, "s2");
    mocked.mySpaces.mockResolvedValue([sp("s1"), sp("s2")]);
    const { unmount } = render(<SpaceGate user={user} />);
    expect(await screen.findByTestId("current")).toHaveTextContent("s2");
    unmount();

    localStorage.setItem(CURRENT_SPACE_KEY, "disparu");
    render(<SpaceGate user={user} />);
    expect(await screen.findByTestId("current")).toHaveTextContent("s1");
  });

  it("bascule de salon et persistance", async () => {
    mocked.mySpaces.mockResolvedValue([sp("s1"), sp("s2")]);
    render(<SpaceGate user={user} />);
    await userEvent.click(await screen.findByText("switch"));
    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe("s2");
    expect(screen.getByTestId("current")).toHaveTextContent("s2");
  });

  it("crée / rejoint un autre salon depuis l'app (sans doublon)", async () => {
    mocked.mySpaces.mockResolvedValue([sp("s1")]);
    mocked.createSpace.mockResolvedValue(sp("s3"));
    mocked.joinByInvite.mockResolvedValue(sp("s3"));
    render(<SpaceGate user={user} />);
    await userEvent.click(await screen.findByText("new"));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));
    expect(screen.getByTestId("current")).toHaveTextContent("s3");
    await userEvent.click(screen.getByText("joinother"));
    await waitFor(() => expect(mocked.joinByInvite).toHaveBeenCalledWith("X"));
    expect(screen.getByTestId("count")).toHaveTextContent("2"); // déjà présent
  });
});
