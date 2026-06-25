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

  it("toggle « Téléchargeable » affiché avec un média non éphémère, masqué si éphémère", () => {
    const { rerender } = render(
      <PostComposer
        onSubmit={vi.fn()}
        initial={{ body: "x", media: { viewOnce: false } }}
      />,
    );
    expect(screen.getByText("Téléchargeable")).toBeInTheDocument();

    rerender(
      <PostComposer
        onSubmit={vi.fn()}
        initial={{ body: "x", media: { viewOnce: true } }}
      />,
    );
    expect(screen.queryByText("Téléchargeable")).toBeNull();
  });

  it("onSubmit reçoit allowDownload depuis le défaut fourni", async () => {
    const onSubmit = vi.fn();
    render(
      <PostComposer
        onSubmit={onSubmit}
        defaultAllowDownload
        initial={{ body: "x", media: { viewOnce: false } }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ allowDownload: true });
  });
});
