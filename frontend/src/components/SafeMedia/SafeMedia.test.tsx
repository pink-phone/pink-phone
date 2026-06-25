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

describe("SafeMedia — mute vidéo (#88)", () => {
  it("vidéo : bouton « activer le son » (muet par défaut), pas sur une image", () => {
    const { rerender } = render(
      <SafeMedia src="data:," alt="x" kind="video" />,
    );
    expect(
      screen.getByRole("button", { name: /activer le son/i }),
    ).toBeInTheDocument();

    rerender(<SafeMedia src="data:," alt="x" kind="image" />);
    expect(screen.queryByRole("button", { name: /son/i })).toBeNull();
  });

  it("toggle mute → le libellé passe à « couper le son »", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<SafeMedia src="data:," alt="x" kind="video" />);
    await userEvent.click(
      screen.getByRole("button", { name: /activer le son/i }),
    );
    expect(
      screen.getByRole("button", { name: /couper le son/i }),
    ).toBeInTheDocument();
  });
});
