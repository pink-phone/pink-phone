import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostComposer } from "./PostComposer";

// jsdom n'implémente pas createObjectURL (aperçu d'un fichier joint).
beforeAll(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:preview",
    revokeObjectURL: () => {},
  });
});

describe("PostComposer", () => {
  it("initialFile (partage natif #86) : média pré-joint → publication possible sans récit", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    render(<PostComposer onSubmit={vi.fn()} initialFile={file} />);
    // Pas de récit, mais un média → bouton Publier actif (canSubmit = body OU média).
    expect(screen.getByRole("button", { name: /^publier$/i })).toBeEnabled();
    // Le toggle « Téléchargeable » apparaît (média non éphémère présent).
    expect(screen.getByText("Téléchargeable")).toBeInTheDocument();
  });

  it("le bouton Publier est désactivé tant qu'il n'y a ni récit ni média", () => {
    render(<PostComposer onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^publier$/i })).toBeDisabled();
  });

  it("saisir un récit active la publication et onSubmit reçoit le body", async () => {
    const onSubmit = vi.fn();
    render(<PostComposer onSubmit={onSubmit} />);

    const body = screen.getByPlaceholderText("Raconte, à tête reposée…");
    await userEvent.type(body, "Un souvenir");

    const publish = screen.getByRole("button", { name: /^publier$/i });
    expect(publish).toBeEnabled();

    await userEvent.click(publish);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      body: "Un souvenir",
      draft: false,
    });
  });

  it("toggle « Téléchargeable » affiché dès qu'il y a un média (existant ou nouveau)", () => {
    const { unmount } = render(
      <PostComposer onSubmit={vi.fn()} initial={{ body: "x", media: [] }} />,
    );
    // Aucun média → pas de toggle téléchargeable.
    expect(screen.queryByText("Téléchargeable")).toBeNull();
    unmount();

    // Un média déjà attaché (édition) → le toggle apparaît (option post-level).
    render(
      <PostComposer
        onSubmit={vi.fn()}
        initial={{ body: "x", media: [{ id: "m1", viewOnce: false }] }}
      />,
    );
    expect(screen.getByText("Téléchargeable")).toBeInTheDocument();
  });

  it("toggle « Éphémère » affiché seulement avec un NOUVEAU fichier, pas pour un média déjà attaché", () => {
    const { unmount } = render(
      <PostComposer
        onSubmit={vi.fn()}
        initial={{ body: "x", media: [{ id: "m1", viewOnce: false }] }}
      />,
    );
    // Média existant uniquement → pas d'option éphémère (elle ne vaut que pour les nouveaux).
    expect(screen.queryByText(/Éphémère/)).toBeNull();
    unmount();

    // Un nouveau fichier pré-joint (partage natif) → l'option éphémère apparaît.
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    render(<PostComposer onSubmit={vi.fn()} initialFile={file} />);
    expect(screen.getByText(/Éphémère/)).toBeInTheDocument();
  });

  it("galerie (#87) : réordonne les médias existants et onSubmit reçoit le nouvel ordre", async () => {
    const onSubmit = vi.fn();
    render(
      <PostComposer
        onSubmit={onSubmit}
        initial={{
          body: "x",
          media: [
            { id: "m1", viewOnce: false },
            { id: "m2", viewOnce: false },
          ],
        }}
      />,
    );

    // Deux médias listés, dans l'ordre m1, m2. On descend le premier (m1).
    const downButtons = screen.getAllByRole("button", { name: "Descendre" });
    await userEvent.click(downButtons[0]);

    await userEvent.click(screen.getByRole("button", { name: /^publier$/i }));
    expect(onSubmit.mock.calls[0][0].media).toEqual([
      { kind: "existing", id: "m2" },
      { kind: "existing", id: "m1" },
    ]);
  });

  it("galerie (#87) : retirer un média le sort de la soumission", async () => {
    const onSubmit = vi.fn();
    render(
      <PostComposer
        onSubmit={onSubmit}
        initial={{
          body: "x",
          media: [
            { id: "m1", viewOnce: false },
            { id: "m2", viewOnce: false },
          ],
        }}
      />,
    );
    const removeButtons = screen.getAllByRole("button", { name: "Retirer" });
    await userEvent.click(removeButtons[0]);

    await userEvent.click(screen.getByRole("button", { name: /^publier$/i }));
    expect(onSubmit.mock.calls[0][0].media).toEqual([
      { kind: "existing", id: "m2" },
    ]);
  });

  it("onSubmit reçoit allowDownload depuis le défaut fourni", async () => {
    const onSubmit = vi.fn();
    render(
      <PostComposer
        onSubmit={onSubmit}
        defaultAllowDownload
        initial={{ body: "x", media: [{ id: "m1", viewOnce: false }] }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ allowDownload: true });
  });
});
