import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Surface } from "./Surface";

describe("Surface", () => {
  it("rend les enfants avec le ton velvet par défaut", () => {
    const { container } = render(<Surface>contenu</Surface>);
    expect(screen.getByText("contenu")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-charcoal-800");
  });

  it("`as` change la balise rendue", () => {
    const { container } = render(<Surface as="section">x</Surface>);
    expect(container.firstChild?.nodeName).toBe("SECTION");
  });
});
