import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Splash } from "./Splash";

describe("Splash", () => {
  it("affiche le nom de l'app et le message par défaut", () => {
    render(<Splash />);
    expect(
      screen.getByRole("heading", { name: "Pink Phone" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Un instant…")).toBeInTheDocument();
  });

  it("affiche un message personnalisé quand fourni", () => {
    render(<Splash message="Chargement…" />);
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByText("Un instant…")).toBeNull();
  });
});
