import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsScreen } from "./SettingsScreen";

// SettingsScreen appelle getTheme() et isPinSet() pendant le rendu (ils lisent
// localStorage qui est undefined sous Node 26+). On stub les modules entiers.
vi.mock("../../theme", () => ({
  getTheme: vi.fn().mockReturnValue("felted"),
  applyTheme: vi.fn(),
  THEMES: ["felted", "red-velvet"] as const,
}));

vi.mock("../../lib/pin", () => ({
  isPinSet: vi.fn().mockReturnValue(false),
  setPin: vi.fn(),
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

// Les notes de version (#90) lisent localStorage directement (indispo sous Node 26+).
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const base = {
  notifMode: "ghost" as const,
  onModeChange: vi.fn(),
};

describe("SettingsScreen — Notes de version (#90)", () => {
  it("pastille « Nouveautés » visible, puis ouverture des notes + pastille disparue", async () => {
    store.clear();
    render(<SettingsScreen {...base} />);
    // Pastille « Nouveautés » présente tant que la version courante n'est pas vue.
    expect(screen.getByText("Nouveautés")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Notes de version/i }),
    );
    // La feuille affiche la version la plus récente (donnée bundlée).
    expect(screen.getByText("Galeries & partage")).toBeInTheDocument();
    // La pastille a disparu (snapshot localStorage marqué vu).
    expect(screen.queryByText("Nouveautés")).toBeNull();
  });
});

describe("SettingsScreen — Mon compte (renommage)", () => {
  it("« Enregistrer » désactivé tant que le nom est inchangé, puis onRenameUser(nouveau)", async () => {
    const onRenameUser = vi.fn();
    render(
      <SettingsScreen {...base} userName="Alex" onRenameUser={onRenameUser} />,
    );
    const field = screen.getByLabelText("Ton prénom");
    expect(field).toHaveValue("Alex");
    // Le bouton de la section compte (1er « Enregistrer ») est désactivé au départ.
    const save = screen.getAllByRole("button", { name: "Enregistrer" })[0];
    expect(save).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, "Alexandra");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onRenameUser).toHaveBeenCalledWith("Alexandra");
  });

  it("section masquée sans userName/onRenameUser", () => {
    render(<SettingsScreen {...base} />);
    expect(screen.queryByText("Mon compte")).toBeNull();
  });
});

describe("SettingsScreen — Mes salons (#67)", () => {
  it("1 salon : section repliée par défaut (radiogroup des salons absent du DOM)", () => {
    render(
      <SettingsScreen
        {...base}
        spaces={[{ id: "s1", name: "Notre salon" }]}
        currentSpaceId="s1"
      />,
    );
    const header = screen.getByRole("button", { name: /mes salons/i });
    expect(header).toHaveAttribute("aria-expanded", "false");
    // Le radiogroup des salons n'est rendu que quand la section est ouverte ET
    // qu'il y a ≥ 2 salons. Ici collapsed, donc absent.
    expect(
      screen.queryByRole("radiogroup", { name: /mes salons/i }),
    ).toBeNull();
  });

  it("≥ 2 salons : section ouverte par défaut, radiogroup des salons visible", () => {
    render(
      <SettingsScreen
        {...base}
        spaces={[
          { id: "s1", name: "Salon 1" },
          { id: "s2", name: "Salon 2" },
        ]}
        currentSpaceId="s1"
      />,
    );
    const header = screen.getByRole("button", { name: /mes salons/i });
    expect(header).toHaveAttribute("aria-expanded", "true");
    // Les 2 radios sont dans le radiogroup "Mes salons" (pas les radios de notif).
    const spaceGroup = screen.getByRole("radiogroup", { name: /mes salons/i });
    expect(within(spaceGroup).getAllByRole("radio")).toHaveLength(2);
  });

  it("cliquer sur l'en-tête ouvre la section repliée", async () => {
    render(
      <SettingsScreen
        {...base}
        spaces={[{ id: "s1", name: "Mon salon" }]}
        currentSpaceId="s1"
      />,
    );
    const header = screen.getByRole("button", { name: /mes salons/i });
    expect(header).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("cliquer sur un salon inactif appelle onSwitchSpace avec son id", async () => {
    const onSwitchSpace = vi.fn();
    render(
      <SettingsScreen
        {...base}
        spaces={[
          { id: "s1", name: "Salon 1" },
          { id: "s2", name: "Salon 2" },
        ]}
        currentSpaceId="s1"
        onSwitchSpace={onSwitchSpace}
      />,
    );
    const spaceGroup = screen.getByRole("radiogroup", { name: /mes salons/i });
    // "Salon 2" est inactif (non disabled), donc cliquable.
    await userEvent.click(within(spaceGroup).getByRole("radio", { name: /salon 2/i }));
    expect(onSwitchSpace).toHaveBeenCalledWith("s2");
  });

  it("le salon actif est aria-checked=true et le salon inactif aria-checked=false", () => {
    render(
      <SettingsScreen
        {...base}
        spaces={[
          { id: "s1", name: "Salon 1" },
          { id: "s2", name: "Salon 2" },
        ]}
        currentSpaceId="s1"
      />,
    );
    const spaceGroup = screen.getByRole("radiogroup", { name: /mes salons/i });
    const radios = within(spaceGroup).getAllByRole("radio");
    const active = radios.find((r) => r.textContent?.includes("Salon 1"))!;
    const inactive = radios.find((r) => r.textContent?.includes("Salon 2"))!;
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(inactive).toHaveAttribute("aria-checked", "false");
  });
});
