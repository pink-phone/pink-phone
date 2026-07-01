import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DesireCard } from "./DesireCard";

describe("DesireCard", () => {
  it("affiche le libellé", () => {
    render(<DesireCard label="Massage" interested={false} matched={false} />);
    expect(screen.getByText("Massage")).toBeInTheDocument();
  });

  it("bouton envie : aria-pressed + onToggleWant", async () => {
    const onToggleWant = vi.fn();
    const { rerender } = render(
      <DesireCard
        label="x"
        interested={false}
        matched={false}
        onToggleWant={onToggleWant}
      />,
    );
    const btn = screen.getByRole("button", { name: /tente/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(btn);
    expect(onToggleWant).toHaveBeenCalledTimes(1);
    rerender(
      <DesireCard label="x" interested matched={false} onToggleWant={onToggleWant} />,
    );
    expect(
      screen.getByRole("button", { name: /non/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("bouton contre : présent avec onToggleAgainst, bascule against", async () => {
    const onToggleAgainst = vi.fn();
    render(
      <DesireCard
        label="x"
        interested={false}
        matched={false}
        onToggleAgainst={onToggleAgainst}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /contre|limite/i }));
    expect(onToggleAgainst).toHaveBeenCalledTimes(1);
  });

  it("limite : badge « Limite » quand limit et pas de match", () => {
    render(<DesireCard label="x" interested={false} matched={false} limit />);
    expect(screen.getByText(/Limite/i)).toBeInTheDocument();
  });

  it("matché : badge « Match ! » (pas de badge limite)", () => {
    render(<DesireCard label="x" interested matched limit />);
    expect(screen.getByText(/Match/)).toBeInTheDocument();
    expect(screen.queryByText(/^Limite/i)).toBeNull();
  });

  it("réalisé : badge + bouton done, câblé", async () => {
    const onToggleDone = vi.fn();
    render(
      <DesireCard
        label="x"
        interested
        matched={false}
        done
        onToggleDone={onToggleDone}
      />,
    );
    expect(screen.getByText(/Réalisé/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /réalisé/i }));
    expect(onToggleDone).toHaveBeenCalledTimes(1);
  });
});
