import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pin = vi.hoisted(() => ({
  isPinSet: vi.fn(),
  verifyPin: vi.fn(),
}));
const bio = vi.hoisted(() => ({
  isBiometricEnabled: vi.fn(),
  verifyBiometric: vi.fn(),
}));
vi.mock("../lib/pin", () => ({ ...pin, PIN_LENGTH: 4 }));
vi.mock("../lib/biometric", () => bio);
vi.mock("../components/LockScreen/LockScreen", () => ({
  LockScreen: (p: {
    error: string | null;
    onSubmit: (pin: string) => void;
    onBiometric?: () => void;
  }) => (
    <div>
      <span data-testid="err">{p.error}</span>
      <button onClick={() => p.onSubmit("1234")}>submit</button>
      {p.onBiometric && <button onClick={p.onBiometric}>bio</button>}
    </div>
  ),
}));

import { LockGate } from "./LockGate";

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.clearAllMocks();
  pin.isPinSet.mockReturnValue(false);
  pin.verifyPin.mockResolvedValue(false);
  bio.isBiometricEnabled.mockReturnValue(false);
  bio.verifyBiometric.mockResolvedValue(false);
  setVisibility("visible");
});

describe("LockGate", () => {
  it("transparent sans PIN", () => {
    render(<LockGate><p>contenu</p></LockGate>);
    expect(screen.getByText("contenu")).toBeInTheDocument();
  });

  it("verrouillé au démarrage avec un PIN ; mauvais PIN → erreur", async () => {
    pin.isPinSet.mockReturnValue(true);
    render(<LockGate><p>contenu</p></LockGate>);
    expect(screen.queryByText("contenu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("submit"));
    await waitFor(() => expect(screen.getByTestId("err")).not.toBeEmptyDOMElement());
    expect(screen.queryByText("contenu")).not.toBeInTheDocument();
  });

  it("bon PIN → déverrouille", async () => {
    pin.isPinSet.mockReturnValue(true);
    pin.verifyPin.mockResolvedValue(true);
    render(<LockGate><p>contenu</p></LockGate>);
    await userEvent.click(screen.getByText("submit"));
    expect(await screen.findByText("contenu")).toBeInTheDocument();
  });

  it("re-verrouille quand l'app passe en arrière-plan", async () => {
    pin.isPinSet.mockReturnValue(true);
    pin.verifyPin.mockResolvedValue(true);
    render(<LockGate><p>contenu</p></LockGate>);
    await userEvent.click(screen.getByText("submit"));
    await screen.findByText("contenu");
    act(() => setVisibility("hidden"));
    expect(screen.queryByText("contenu")).not.toBeInTheDocument();
  });

  it("ne verrouille pas en arrière-plan sans PIN", () => {
    render(<LockGate><p>contenu</p></LockGate>);
    act(() => setVisibility("hidden"));
    expect(screen.getByText("contenu")).toBeInTheDocument();
  });

  it("biométrie tentée automatiquement : succès → déverrouille", async () => {
    pin.isPinSet.mockReturnValue(true);
    bio.isBiometricEnabled.mockReturnValue(true);
    bio.verifyBiometric.mockResolvedValue(true);
    render(<LockGate><p>contenu</p></LockGate>);
    expect(await screen.findByText("contenu")).toBeInTheDocument();
    expect(bio.verifyBiometric).toHaveBeenCalledTimes(1);
  });

  it("biométrie en échec : reste verrouillé, bouton bio relance", async () => {
    pin.isPinSet.mockReturnValue(true);
    bio.isBiometricEnabled.mockReturnValue(true);
    render(<LockGate><p>contenu</p></LockGate>);
    await waitFor(() => expect(bio.verifyBiometric).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("contenu")).not.toBeInTheDocument();
    bio.verifyBiometric.mockResolvedValue(true);
    await userEvent.click(screen.getByText("bio"));
    expect(await screen.findByText("contenu")).toBeInTheDocument();
  });

  it("pas de bouton biométrie si non enrôlée", () => {
    pin.isPinSet.mockReturnValue(true);
    render(<LockGate><p>contenu</p></LockGate>);
    expect(screen.queryByText("bio")).not.toBeInTheDocument();
    expect(bio.verifyBiometric).not.toHaveBeenCalled();
  });
});
