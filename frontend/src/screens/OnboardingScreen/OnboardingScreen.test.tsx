import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingScreen } from "./OnboardingScreen";

describe("OnboardingScreen", () => {
  it("créer un espace : nom pré-rempli, « Créer » → onCreate(nom)", async () => {
    const onCreate = vi.fn();
    render(<OnboardingScreen onCreate={onCreate} onJoin={vi.fn()} />);
    expect(screen.getByLabelText("Nom de l'espace")).toHaveValue("Pink Phone");
    await userEvent.click(screen.getByRole("button", { name: "Créer" }));
    expect(onCreate).toHaveBeenCalledWith("Pink Phone");
  });

  it("rejoindre : « Rejoindre » désactivé tant que le code est vide, puis onJoin(code)", async () => {
    const onJoin = vi.fn();
    render(<OnboardingScreen onCreate={vi.fn()} onJoin={onJoin} />);
    const join = screen.getByRole("button", { name: "Rejoindre" });
    expect(join).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("Code d'invitation"),
      "EmberVelvet#7",
    );
    expect(join).toBeEnabled();
    await userEvent.click(join);
    expect(onJoin).toHaveBeenCalledWith("EmberVelvet#7");
  });

  it("salue l'utilisateur par son prénom si fourni", () => {
    render(
      <OnboardingScreen userName="Alex" onCreate={vi.fn()} onJoin={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", { name: "Bienvenue, Alex" }),
    ).toBeInTheDocument();
  });
});
