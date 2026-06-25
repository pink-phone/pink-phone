import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChallengeComposer } from "./ChallengeComposer";
import type { ChallengePreset } from "../ChallengeCard/challenge";

const suggestions: ChallengePreset[] = [
  { title: "Massage aux huiles", description: "Une heure rien que pour toi.", intensity: "soft" },
];

describe("ChallengeComposer", () => {
  it("titre requis : Proposer désactivé tant que le titre est vide", async () => {
    render(<ChallengeComposer onSubmit={vi.fn()} suggestions={suggestions} />);
    const submit = screen.getByRole("button", { name: /Proposer/ });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Titre du défi"), "Surprise");
    expect(submit).toBeEnabled();
  });

  it("onSubmit reçoit le brouillon (titre + intensité)", async () => {
    const onSubmit = vi.fn();
    render(<ChallengeComposer onSubmit={onSubmit} suggestions={suggestions} />);
    await userEvent.type(screen.getByLabelText("Titre du défi"), "Surprise");
    await userEvent.click(screen.getByRole("button", { name: /Proposer/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Surprise",
      intensity: "hot",
    });
  });

  it("clic sur une inspiration pré-remplit le titre et la description", async () => {
    render(<ChallengeComposer onSubmit={vi.fn()} suggestions={suggestions} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Massage aux huiles" }),
    );
    expect(screen.getByLabelText("Titre du défi")).toHaveValue(
      "Massage aux huiles",
    );
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Une heure rien que pour toi.",
    );
  });

  it("édition : banque d'inspiration masquée + bouton Enregistrer", () => {
    render(
      <ChallengeComposer
        onSubmit={vi.fn()}
        initial={{ title: "Déjà là", description: "", intensity: "soft" }}
      />,
    );
    expect(screen.queryByText("Inspiration (la banque)")).toBeNull();
    expect(screen.getByLabelText("Titre du défi")).toHaveValue("Déjà là");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
  });
});
