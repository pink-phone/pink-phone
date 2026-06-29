import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DesireCard } from "./DesireCard";

describe("DesireCard", () => {
  it("affiche le libellé et l'indice", () => {
    render(
      <DesireCard
        label="Massage"
        description="Un indice"
        interested={false}
        matched={false}
      />,
    );
    expect(screen.getByText("Massage")).toBeInTheDocument();
    expect(screen.getByText("Un indice")).toBeInTheDocument();
  });

  it("aria-pressed reflète mon intérêt", () => {
    const { rerender } = render(
      <DesireCard label="x" interested={false} matched={false} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    rerender(<DesireCard label="x" interested matched={false} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("matché : affiche le badge « Match ! »", () => {
    render(<DesireCard label="x" interested matched />);
    expect(screen.getByText(/Match/)).toBeInTheDocument();
  });

  it("non matché : pas de badge", () => {
    render(<DesireCard label="x" interested matched={false} />);
    expect(screen.queryByText(/Match/)).toBeNull();
  });

  it("clic appelle onToggle", async () => {
    const onToggle = vi.fn();
    render(
      <DesireCard label="x" interested={false} matched={false} onToggle={onToggle} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
