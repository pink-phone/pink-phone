import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactionSettings } from "./ReactionSettings";
import type { ReactionId } from "../ReactionBar/ReactionBar";

const value: ReactionId[] = ["heart", "fire", "smirk"];

describe("ReactionSettings", () => {
  it("liste les réactions actives dans l'ordre", () => {
    render(
      <ReactionSettings value={value} allowCustom onChange={vi.fn()} />,
    );
    expect(screen.getByText("Cœur")).toBeInTheDocument();
    expect(screen.getByText("Chaud")).toBeInTheDocument();
  });

  it("↓ sur le 1er échange l'ordre (onChange)", async () => {
    const onChange = vi.fn();
    render(<ReactionSettings value={value} allowCustom onChange={onChange} />);
    // Plusieurs boutons ↓ ; le premier descend "heart" sous "fire".
    await userEvent.click(screen.getAllByRole("button", { name: "↓" })[0]);
    expect(onChange).toHaveBeenCalledWith(["fire", "heart", "smirk"], true);
  });

  it("✕ retire une réaction", async () => {
    const onChange = vi.fn();
    render(<ReactionSettings value={value} allowCustom onChange={onChange} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Désactiver la réaction" })[0],
    );
    expect(onChange).toHaveBeenCalledWith(["fire", "smirk"], true);
  });

  it("réactiver une réaction désactivée l'ajoute en fin", async () => {
    const onChange = vi.fn();
    // breath/hush sont désactivées (absentes de value).
    render(<ReactionSettings value={value} allowCustom onChange={onChange} />);
    const enablers = screen.getAllByRole("button", {
      name: "Activer la réaction",
    });
    await userEvent.click(enablers[0]);
    // 1er désactivé dans l'ordre ALL_IDS = "breath".
    expect(onChange).toHaveBeenCalledWith([...value, "breath"], true);
  });

  it("toggle « Réactions libres » bascule allowCustom", async () => {
    const onChange = vi.fn();
    render(<ReactionSettings value={value} allowCustom onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch", { name: /Réactions libres/ }));
    expect(onChange).toHaveBeenCalledWith(value, false);
  });
});
