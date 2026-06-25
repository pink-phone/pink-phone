import { describe, it, expect } from "vitest";
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
