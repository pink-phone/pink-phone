import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DesireCard } from "./DesireCard";

describe("DesireCard", () => {
  it("affiche le libellé", () => {
    render(<DesireCard label="Massage" interested={false} matched={false} />);
    expect(screen.getByText("Massage")).toBeInTheDocument();
  });

  it("le bouton intérêt reflète mon intérêt (aria-pressed)", () => {
    const { rerender } = render(
      <DesireCard label="x" interested={false} matched={false} />,
    );
    expect(
      screen.getByRole("button", { name: /tente/i }),
    ).toHaveAttribute("aria-pressed", "false");
    rerender(<DesireCard label="x" interested matched={false} />);
    expect(
      screen.getByRole("button", { name: /non/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("matché : affiche le badge « Match ! »", () => {
    render(<DesireCard label="x" interested matched />);
    expect(screen.getByText(/Match/)).toBeInTheDocument();
  });

  it("clic sur la carte appelle onToggle (intérêt)", async () => {
    const onToggle = vi.fn();
    render(
      <DesireCard
        label="x"
        interested={false}
        matched={false}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /tente/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("bouton « réalisé » : visible avec onToggleDone, bascule done", async () => {
    const onToggleDone = vi.fn();
    const { rerender } = render(
      <DesireCard
        label="x"
        interested
        matched={false}
        onToggleDone={onToggleDone}
      />,
    );
    const doneBtn = screen.getByRole("button", { name: /réalisé/i });
    expect(doneBtn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(doneBtn);
    expect(onToggleDone).toHaveBeenCalledTimes(1);
    // Marqué réalisé : badge + aria-pressed.
    rerender(
      <DesireCard
        label="x"
        interested
        matched={false}
        done
        onToggleDone={onToggleDone}
      />,
    );
    expect(screen.getByText(/Réalisé/)).toBeInTheDocument();
  });

  it("pas de bouton réalisé sans onToggleDone", () => {
    render(<DesireCard label="x" interested matched={false} />);
    expect(screen.queryByRole("button", { name: /réalisé/i })).toBeNull();
  });
});
