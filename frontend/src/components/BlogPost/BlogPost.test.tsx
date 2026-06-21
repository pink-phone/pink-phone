import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
        media={{ src: "https://example.test/x.jpg", alt: "photo" }}
      />,
    );
    // Le <p> du récit (classe whitespace-pre-line) ne doit pas être rendu.
    expect(container.querySelector("p.whitespace-pre-line")).toBeNull();
    // La carte rend quand même l'auteur.
    expect(screen.getByText("Camille")).toBeInTheDocument();
  });
});
