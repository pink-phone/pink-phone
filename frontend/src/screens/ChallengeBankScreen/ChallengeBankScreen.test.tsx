import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChallengeBankScreen, type BankItem } from "./ChallengeBankScreen";

const item = (id: string, overrides: Partial<BankItem> = {}): BankItem => ({
  id,
  title: "Mon idée",
  description: "Une belle description",
  intensity: "hot",
  isOwn: false,
  done: false,
  hidden: false,
  ...overrides,
});

const base = {
  suggestions: [],
  onPropose: vi.fn(),
  onAdd: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onSetHidden: vi.fn(),
};

describe("ChallengeBankScreen", () => {
  it("un item done=true affiche le badge « Déjà fait »", () => {
    render(
      <ChallengeBankScreen
        {...base}
        suggestions={[item("sg1", { done: true })]}
      />,
    );
    expect(screen.getByText("Déjà fait")).toBeInTheDocument();
  });

  it("un item hidden=true affiche le badge « Masqué »", () => {
    render(
      <ChallengeBankScreen
        {...base}
        suggestions={[item("sg1", { hidden: true })]}
      />,
    );
    expect(screen.getByText("Masqué")).toBeInTheDocument();
  });

  it("un item non masqué n'affiche pas le badge « Masqué »", () => {
    render(
      <ChallengeBankScreen {...base} suggestions={[item("sg1")]} />,
    );
    expect(screen.queryByText("Masqué")).toBeNull();
  });

  it("onPropose est appelé avec le draft et le sourceId correct", async () => {
    const onPropose = vi.fn();
    render(
      <ChallengeBankScreen
        {...base}
        suggestions={[item("sg-42", { title: "Test idée", intensity: "soft" })]}
        onPropose={onPropose}
      />,
    );
    // Ouvre le menu contextuel
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    // Clique sur « Proposer au partenaire »
    await userEvent.click(
      screen.getByRole("menuitem", { name: /proposer au partenaire/i }),
    );
    expect(onPropose).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Test idée", intensity: "soft" }),
      "sg-42",
    );
  });

  it("menu « Masquer » appelle onSetHidden(id, true) sur un item visible", async () => {
    const onSetHidden = vi.fn();
    render(
      <ChallengeBankScreen
        {...base}
        suggestions={[item("sg-1")]}
        onSetHidden={onSetHidden}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: /masquer/i }),
    );
    expect(onSetHidden).toHaveBeenCalledWith("sg-1", true);
  });

  it("menu « Réafficher » appelle onSetHidden(id, false) sur un item masqué", async () => {
    const onSetHidden = vi.fn();
    render(
      <ChallengeBankScreen
        {...base}
        suggestions={[item("sg-1", { hidden: true })]}
        onSetHidden={onSetHidden}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: /réafficher/i }),
    );
    expect(onSetHidden).toHaveBeenCalledWith("sg-1", false);
  });

  it("soumettre le formulaire d'ajout appelle onAdd", async () => {
    const onAdd = vi.fn();
    render(<ChallengeBankScreen {...base} onAdd={onAdd} />);

    // Ouvre la feuille d'ajout (bouton dans l'en-tête)
    await userEvent.click(screen.getAllByRole("button", { name: /ajouter/i })[0]);
    // Saisit un titre (champ obligatoire) — le champ est dans la Sheet (dialog)
    const dialog = screen.getByRole("dialog");
    await userEvent.type(
      screen.getByRole("textbox", { name: /titre/i }),
      "Ma nouvelle idée",
    );
    // Soumet via le bouton "＋ Ajouter" à l'intérieur de la feuille
    await userEvent.click(
      within(dialog).getByRole("button", { name: /ajouter/i }),
    );
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Ma nouvelle idée" }),
    );
  });
});
