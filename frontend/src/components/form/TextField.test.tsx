import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("associe le label à l'input et affiche le hint", () => {
    render(<TextField label="Titre" hint="Optionnel" placeholder="…" />);
    // getByLabelText prouve l'association htmlFor/id.
    const input = screen.getByLabelText("Titre");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "…");
    expect(screen.getByText("Optionnel")).toBeInTheDocument();
  });

  it("transmet les props natives (value/onChange)", async () => {
    const onChange = vi.fn();
    render(<TextField label="Nom" value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Nom"), "a");
    expect(onChange).toHaveBeenCalled();
  });
});
