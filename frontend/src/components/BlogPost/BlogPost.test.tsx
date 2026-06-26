import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { BlogPost } from "./BlogPost";

const base = {
  author: { name: "Camille", glyph: "C" },
  timeLabel: "Hier",
};

describe("BlogPost", () => {
  it("affiche le récit quand body est renseigné", () => {
    render(<BlogPost {...base} body="Mon récit intime" />);
    expect(screen.getByText("Mon récit intime")).toBeInTheDocument();
  });

  it("post média-seul : pas de paragraphe de récit quand body est vide", () => {
    const { container } = render(
      <BlogPost
        {...base}
        body=""
        media={[{ src: "https://example.test/x.jpg", alt: "photo" }]}
      />,
    );
    // Le <p> du récit (classe whitespace-pre-line) ne doit pas être rendu.
    expect(container.querySelector("p.whitespace-pre-line")).toBeNull();
    // La carte rend quand même l'auteur.
    expect(screen.getByText("Camille")).toBeInTheDocument();
  });

  it("brouillon : liseré pointillé « croquis », absent d'un post publié", () => {
    const { container, rerender } = render(
      <BlogPost {...base} body="x" draft />,
    );
    expect(container.querySelector(".border-dashed")).not.toBeNull();
    rerender(<BlogPost {...base} body="x" />);
    expect(container.querySelector(".border-dashed")).toBeNull();
  });

  it("« Vu » : caché sans seenBy, affiché dès qu'un membre a vu", () => {
    const { rerender } = render(
      <BlogPost {...base} body="x" isMine seenBy={[]} />,
    );
    expect(screen.queryByText(/Vu/)).toBeNull();
    rerender(
      <BlogPost
        {...base}
        body="x"
        isMine
        seenBy={[{ name: "Alex", timeLabel: "il y a 5 min" }]}
      />,
    );
    expect(screen.getByText(/Vu/)).toBeInTheDocument();
  });

  it("favori (#96) : étoile rendue uniquement sur un post publié avec handler", () => {
    const { rerender } = render(<BlogPost {...base} body="x" />);
    // Sans handler : pas d'étoile.
    expect(screen.queryByRole("button", { name: /favori/i })).toBeNull();
    // Avec handler sur un post publié : bouton favori présent, non pressé.
    rerender(<BlogPost {...base} body="x" onToggleFavorite={() => {}} />);
    const star = screen.getByRole("button", { name: /Ajouter aux favoris/i });
    expect(star).toHaveAttribute("aria-pressed", "false");
    // Sur un brouillon : pas d'étoile même avec handler.
    rerender(
      <BlogPost {...base} body="x" draft isMine onToggleFavorite={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /favori/i })).toBeNull();
  });

  it("favori : clic appelle onToggleFavorite ; état actif → aria-pressed", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <BlogPost {...base} body="x" onToggleFavorite={onToggle} />,
    );
    await user.click(screen.getByRole("button", { name: /Ajouter aux favoris/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(
      <BlogPost {...base} body="x" isFavorite onToggleFavorite={onToggle} />,
    );
    expect(
      screen.getByRole("button", { name: /Retirer des favoris/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("au clic sur « Vu », la bulle liste qui a vu (et quand)", async () => {
    const user = userEvent.setup();
    render(
      <BlogPost
        {...base}
        body="x"
        isMine
        seenBy={[
          { name: "Robin", timeLabel: "il y a 5 min" },
          { name: "Alex", timeLabel: "il y a 1 h" },
        ]}
      />,
    );
    // Fermée au départ : les noms ne sont pas visibles (Robin n'est pas l'auteur).
    expect(screen.queryByText("Robin")).toBeNull();
    await user.click(screen.getByRole("button", { name: /qui a vu/i }));
    expect(screen.getByText("Robin")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("il y a 5 min")).toBeInTheDocument();
  });
});
