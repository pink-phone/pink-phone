import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafeMedia } from "./SafeMedia";

describe("SafeMedia — téléchargement (#78)", () => {
  it("affiche le bouton de téléchargement quand downloadable", () => {
    render(<SafeMedia src="data:," alt="x" downloadable />);
    expect(
      screen.getByRole("button", { name: /télécharger le média/i }),
    ).toBeInTheDocument();
  });

  it("pas de bouton de téléchargement par défaut", () => {
    render(<SafeMedia src="data:," alt="x" />);
    expect(
      screen.queryByRole("button", { name: /télécharger le média/i }),
    ).toBeNull();
  });

  it("pas de bouton sur un média éphémère déjà consommé", () => {
    render(<SafeMedia src="data:," alt="x" downloadable viewOnce consumed />);
    expect(
      screen.queryByRole("button", { name: /télécharger le média/i }),
    ).toBeNull();
  });
});
