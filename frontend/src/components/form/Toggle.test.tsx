import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("reflète `checked` via aria-checked et bascule au clic", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Éphémère" />);
    const sw = screen.getByRole("switch", { name: "Éphémère" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("affiche le hint quand fourni", () => {
    render(<Toggle checked onChange={() => {}} label="L" hint="aide" />);
    expect(screen.getByText("aide")).toBeInTheDocument();
  });
});
