import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactionBar } from "./ReactionBar";

describe("ReactionBar", () => {
  it("rend les réactions prédéfinies et toggle onToggle au clic", async () => {
    const onToggle = vi.fn();
    render(<ReactionBar onToggle={onToggle} allowCustom={false} />);
    // 5 réactions prédéfinies par défaut.
    expect(screen.getByRole("button", { name: "Cœur" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Chaud" }));
    expect(onToggle).toHaveBeenCalledWith("fire");
  });

  it("`order` limite/réordonne les prédéfinies", () => {
    render(<ReactionBar order={["hush"]} allowCustom={false} />);
    expect(screen.getByRole("button", { name: "Notre secret" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cœur" })).toBeNull();
  });

  it("ma réaction = état actif (aria-pressed) ; celle de l'autre = aria dédié + compteur", () => {
    render(
      <ReactionBar
        counts={{ fire: 2, smirk: 1 }}
        mine={["fire"]}
        allowCustom={false}
      />,
    );
    // La mienne : aria-pressed true, libellé simple.
    expect(screen.getByRole("button", { name: "Chaud" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // De l'autre (count>0, pas mienne) : libellé « réaction de l'autre ».
    const byOther = screen.getByRole("button", {
      name: "Coquin — réaction de l'autre",
    });
    expect(byOther).toHaveAttribute("aria-pressed", "false");
    expect(byOther).toHaveTextContent("1");
  });

  it("réaction libre : « + » ouvre un champ, la saisie validée appelle onToggle", async () => {
    const onToggle = vi.fn();
    render(<ReactionBar onToggle={onToggle} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Ajouter une réaction (emoji)" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Ajouter une réaction (emoji)",
    });
    await userEvent.type(input, "🌶️{Enter}");
    expect(onToggle).toHaveBeenCalledWith("🌶️");
  });

  it("réaction custom déjà présente (la mienne) est rendue", () => {
    render(
      <ReactionBar counts={{ "🌶️": 1 }} mine={["🌶️"]} allowCustom={false} />,
    );
    const btn = screen.getByRole("button", { name: "🌶️" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveTextContent("1");
  });
});
