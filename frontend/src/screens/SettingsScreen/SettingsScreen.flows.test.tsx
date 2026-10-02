import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as biometric from "../../lib/biometric";
import * as pin from "../../lib/pin";
import { SettingsScreen } from "./SettingsScreen";

// Mêmes doublures que SettingsScreen.test.tsx (localStorage/thème/PIN indisponibles
// ou non déterministes en jsdom) : ici on pilote leurs retours pour dérouler les
// parcours PIN / biométrie / salons.
vi.mock("../../theme", () => ({
  getTheme: vi.fn().mockReturnValue("felted"),
  applyTheme: vi.fn(),
  THEMES: ["felted", "red-velvet"] as const,
}));
vi.mock("../../lib/pin", () => ({
  isPinSet: vi.fn().mockReturnValue(false),
  setPin: vi.fn().mockResolvedValue(undefined),
  verifyPin: vi.fn(),
  clearPin: vi.fn(),
  PIN_LENGTH: 4,
}));
vi.mock("../../lib/biometric", () => ({
  isBiometricSupported: vi.fn().mockResolvedValue(false),
  isBiometricEnabled: vi.fn().mockReturnValue(false),
  enableBiometric: vi.fn(),
  disableBiometric: vi.fn(),
}));

const p = vi.mocked(pin);
const b = vi.mocked(biometric);

let store: Map<string, string>;
beforeEach(() => {
  vi.clearAllMocks();
  p.isPinSet.mockReturnValue(false);
  p.setPin.mockResolvedValue(undefined);
  b.isBiometricSupported.mockResolvedValue(false);
  b.isBiometricEnabled.mockReturnValue(false);
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const base = { notifMode: "ghost" as const, onModeChange: vi.fn() };

async function typePin(digits: string) {
  for (const d of digits) {
    await userEvent.click(screen.getByRole("button", { name: d }));
  }
}

describe("SettingsScreen — verrouillage par code", () => {
  it("activation : saisie puis confirmation → code enregistré, feuille fermée", async () => {
    render(<SettingsScreen {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Activer le code" }));
    expect((await screen.findAllByRole("heading", { name: "Choisis un code" })).length).toBeGreaterThan(0);
    await typePin("1234");
    expect((await screen.findAllByRole("heading", { name: "Confirme le code" })).length).toBeGreaterThan(0);
    await typePin("1234");
    await waitFor(() => expect(p.setPin).toHaveBeenCalledWith("1234"));
    await waitFor(() => expect(screen.queryAllByRole("heading", { name: "Confirme le code" })).toHaveLength(0));
  });

  it("codes différents : message d'erreur et retour à la première saisie", async () => {
    render(<SettingsScreen {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Activer le code" }));
    await typePin("1234");
    await screen.findAllByRole("heading", { name: "Confirme le code" });
    await typePin("1111");
    expect(await screen.findByText("Les codes ne correspondent pas.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Choisis un code" }).length).toBeGreaterThan(0);
    expect(p.setPin).not.toHaveBeenCalled();
  });

  it("biométrie disponible : propose de l'activer juste après le code", async () => {
    b.isBiometricSupported.mockResolvedValue(true);
    b.enableBiometric.mockResolvedValue(true);
    render(<SettingsScreen {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Activer le code" }));
    await typePin("1234");
    await screen.findAllByRole("heading", { name: "Confirme le code" });
    await typePin("1234");
    expect(await screen.findByText("Ajouter la biométrie ?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Activer maintenant" }));
    await waitFor(() => expect(b.enableBiometric).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Ajouter la biométrie ?")).toBeNull());
  });

  it("proposition biométrique : échec → message ; « Pas maintenant » ferme", async () => {
    b.isBiometricSupported.mockResolvedValue(true);
    b.enableBiometric.mockResolvedValue(false);
    render(<SettingsScreen {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Activer le code" }));
    await typePin("1234");
    await screen.findAllByRole("heading", { name: "Confirme le code" });
    await typePin("1234");
    await userEvent.click(await screen.findByRole("button", { name: "Activer maintenant" }));
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("Activation de la biométrie impossible");
    await userEvent.click(screen.getByRole("button", { name: "Pas maintenant" }));
    await waitFor(() => expect(screen.queryByText("Ajouter la biométrie ?")).toBeNull());
  });

  it("désactivation : mauvais code refusé, bon code efface le PIN et la biométrie", async () => {
    p.isPinSet.mockReturnValue(true);
    p.verifyPin.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<SettingsScreen {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Désactiver" }));
    expect((await screen.findAllByRole("heading", { name: "Entre ton code actuel" })).length).toBeGreaterThan(0);
    await typePin("0000");
    expect(await screen.findByText("Code incorrect. Réessaie.")).toBeInTheDocument();
    expect(p.clearPin).not.toHaveBeenCalled();
    await typePin("1234");
    await waitFor(() => expect(p.clearPin).toHaveBeenCalled());
    expect(b.disableBiometric).toHaveBeenCalled();
  });

  it("« Modifier le code » rouvre la saisie d'un nouveau code", async () => {
    p.isPinSet.mockReturnValue(true);
    render(<SettingsScreen {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Modifier le code" }));
    expect((await screen.findAllByRole("heading", { name: "Choisis un code" })).length).toBeGreaterThan(0);
  });

  it("biométrie depuis les réglages : activer puis désactiver ; échec signalé", async () => {
    p.isPinSet.mockReturnValue(true);
    b.isBiometricSupported.mockResolvedValue(true);
    b.enableBiometric.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<SettingsScreen {...base} />);
    const enable = await screen.findByRole("button", { name: "Activer la biométrie" });
    await userEvent.click(enable);
    expect(await screen.findByRole("alert")).toHaveTextContent("Activation de la biométrie impossible");
    await userEvent.click(screen.getByRole("button", { name: "Activer la biométrie" }));
    await userEvent.click(await screen.findByRole("button", { name: "Désactiver la biométrie" }));
    expect(b.disableBiometric).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Activer la biométrie" })).toBeInTheDocument();
  });
});

describe("SettingsScreen — réglages du salon", () => {
  const space = { name: "Notre salon", timezone: "Europe/Paris" };

  it("chaque interrupteur appelle son callback avec la valeur inversée", async () => {
    const h = {
      onBlindMoodChange: vi.fn(),
      onAllowMediaDownloadChange: vi.fn(),
      onDesiresEnabledChange: vi.fn(),
      onDesiresExplicitChange: vi.fn(),
      onEveningMenuEnabledChange: vi.fn(),
      onEveningMenuBlindChange: vi.fn(),
      onHotAnimChange: vi.fn(),
    };
    render(
      <SettingsScreen
        {...base}
        {...h}
        space={{ ...space, desiresEnabled: true, eveningMenuEnabled: true }}
      />,
    );
    const sw = screen.getAllByRole("switch");
    for (const s of sw) await userEvent.click(s);
    expect(h.onBlindMoodChange).toHaveBeenCalledWith(true);
    expect(h.onAllowMediaDownloadChange).toHaveBeenCalledWith(true);
    expect(h.onDesiresEnabledChange).toHaveBeenCalledWith(false);
    expect(h.onDesiresExplicitChange).toHaveBeenCalledWith(false);
    expect(h.onEveningMenuEnabledChange).toHaveBeenCalledWith(false);
    expect(h.onEveningMenuBlindChange).toHaveBeenCalledWith(false);
    expect(h.onHotAnimChange).toHaveBeenCalledWith(false);
  });

  it("renommer le salon : appelé seulement si le nom change", async () => {
    const onRenameSpace = vi.fn();
    render(<SettingsScreen {...base} space={space} onRenameSpace={onRenameSpace} />);
    const field = screen.getByLabelText("Nom du salon");
    await userEvent.type(field, "{Enter}");
    expect(onRenameSpace).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, "  Cocon {Enter}");
    expect(onRenameSpace).toHaveBeenCalledWith("Cocon");
  });

  it("créer / rejoindre un autre salon : succès vide le champ, échec affiche l'erreur", async () => {
    const onCreateSpace = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("x"));
    const onJoinSpace = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsScreen
        {...base}
        space={space}
        spaces={[{ id: "a", name: "A" }, { id: "b", name: "B" }]}
        currentSpaceId="a"
        onSwitchSpace={vi.fn()}
        onCreateSpace={onCreateSpace}
        onJoinSpace={onJoinSpace}
      />,
    );
    const create = screen.getByLabelText(/Créer un autre salon/i);
    await userEvent.type(create, "Nouveau{Enter}");
    await waitFor(() => expect(onCreateSpace).toHaveBeenCalledWith("Nouveau"));
    await waitFor(() => expect(create).toHaveValue(""));

    await userEvent.type(create, "Raté{Enter}");
    expect(await screen.findByText("une erreur est survenue")).toBeInTheDocument();

    const join = screen.getByLabelText("Rejoindre un salon");
    await userEvent.type(join, " CODE#1 {Enter}");
    await waitFor(() => expect(onJoinSpace).toHaveBeenCalledWith("CODE#1"));
  });

  it("code d'invitation : générer puis afficher", async () => {
    const onCreateInvite = vi.fn();
    const { rerender } = render(
      <SettingsScreen {...base} space={space} members={[{ id: "u1", name: "Alex" }]} onCreateInvite={onCreateInvite} inviteCode={null} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Inviter un membre" }));
    expect(onCreateInvite).toHaveBeenCalled();
    rerender(<SettingsScreen {...base} space={space} members={[{ id: "u1", name: "Alex" }]} onCreateInvite={onCreateInvite} inviteCode="EmberVelvet#7" />);
    expect(screen.getByText("EmberVelvet#7")).toBeInTheDocument();
  });
});
