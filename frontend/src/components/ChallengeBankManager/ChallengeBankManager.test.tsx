import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { ChallengeBankManager, type BankSuggestion } from "./ChallengeBankManager";

const t = (k: string) => i18n.t(k as never) as string;

const items: BankSuggestion[] = [
  { id: "a", title: "Massage", description: "Dix minutes", intensity: "soft" },
  { id: "b", title: "Surprise", description: "Ce soir", intensity: "hot" },
];

function setup(suggestions = items) {
  const onAdd = vi.fn();
  const onUpdate = vi.fn();
  const onDelete = vi.fn();
  render(
    <ChallengeBankManager
      suggestions={suggestions}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />,
  );
  return { onAdd, onUpdate, onDelete };
}

const titleField = () => screen.getByPlaceholderText(t("challengeComposer.titlePlaceholder"));
const descField = () => screen.getByPlaceholderText(t("challengeComposer.descriptionPlaceholder"));

describe("ChallengeBankManager", () => {
  it("état vide", () => {
    setup([]);
    expect(screen.getByText(t("challengeBank.empty"))).toBeInTheDocument();
  });

  it("liste les propositions du salon", () => {
    setup();
    expect(screen.getByText("Massage")).toBeInTheDocument();
    expect(screen.getByText("Surprise")).toBeInTheDocument();
    expect(screen.queryByText(t("challengeBank.empty"))).not.toBeInTheDocument();
  });

  it("le bouton d'ajout est désactivé tant que titre ET description sont vides", async () => {
    setup([]);
    const add = screen.getByRole("button", { name: t("challengeBank.add") });
    expect(add).toBeDisabled();
    await userEvent.type(titleField(), "   ");
    await userEvent.type(descField(), "d");
    expect(add).toBeDisabled();
    await userEvent.clear(titleField());
    await userEvent.type(titleField(), "T");
    expect(add).toBeEnabled();
  });

  it("ajoute (valeurs trim, intensité par défaut hot) puis réinitialise", async () => {
    const { onAdd } = setup([]);
    await userEvent.type(titleField(), "  Titre ");
    await userEvent.type(descField(), " Desc  ");
    await userEvent.click(screen.getByRole("button", { name: t("challengeBank.add") }));
    expect(onAdd).toHaveBeenCalledWith({ title: "Titre", description: "Desc", intensity: "hot" });
    expect(titleField()).toHaveValue("");
    expect(descField()).toHaveValue("");
  });

  it("édite : préremplit, met à jour, repasse en mode ajout", async () => {
    const { onUpdate, onAdd } = setup();
    await userEvent.click(screen.getAllByLabelText(t("challengeBank.edit"))[0]);
    expect(titleField()).toHaveValue("Massage");
    expect(descField()).toHaveValue("Dix minutes");
    await userEvent.type(titleField(), " v2");
    await userEvent.click(screen.getByRole("button", { name: t("settings.save") }));
    expect(onUpdate).toHaveBeenCalledWith("a", {
      title: "Massage v2",
      description: "Dix minutes",
      intensity: "soft",
    });
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: t("challengeBank.add") })).toBeInTheDocument();
  });

  it("annuler l'édition vide le formulaire sans rien envoyer", async () => {
    const { onUpdate } = setup();
    await userEvent.click(screen.getAllByLabelText(t("challengeBank.edit"))[1]);
    await userEvent.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(titleField()).toHaveValue("");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: t("common.cancel") })).not.toBeInTheDocument();
  });

  it("supprime une proposition", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getAllByLabelText(t("challengeBank.delete"))[1]);
    expect(onDelete).toHaveBeenCalledWith("b");
  });
});
