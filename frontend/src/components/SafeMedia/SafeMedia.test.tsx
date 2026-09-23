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

describe("SafeMedia — ratio connu avant chargement", () => {
  it("pose le bon ratio dès le montage si width/height sont fournis, avant tout clic ni chargement", () => {
    // `loader` ne se résout jamais dans ce test : le fichier n'est jamais
    // téléchargé, seules les dimensions passées en props doivent déterminer le
    // ratio (le cas réel des médias authentifiés — cf. width/height renvoyés
    // par l'API, calculés à l'upload côté backend).
    render(
      <SafeMedia
        alt="x"
        loader={() => new Promise(() => {})}
        width={1200}
        height={630}
      />,
    );
    const container = screen.getByRole("button", {
      name: /maintenir pour révéler/i,
    });
    expect(container.style.aspectRatio).toBe(`${1200 / 630} / 1`);
  });

  it("sans width/height, pas de ratio inline (retombe sur le cadre 4:5 par défaut)", () => {
    render(<SafeMedia alt="x" loader={() => new Promise(() => {})} />);
    const container = screen.getByRole("button", {
      name: /maintenir pour révéler/i,
    });
    expect(container.style.aspectRatio).toBe("");
  });
});
