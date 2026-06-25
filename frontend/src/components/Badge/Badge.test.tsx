import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("rend le texte et l'icône optionnelle", () => {
    render(
      <Badge tone="hot" icon={<span data-testid="ic">🔥</span>}>
        Hot
      </Badge>,
    );
    expect(screen.getByText("Hot")).toBeInTheDocument();
    expect(screen.getByTestId("ic")).toBeInTheDocument();
  });

  it("applique la classe du ton demandé", () => {
    const { container } = render(<Badge tone="hard">x</Badge>);
    expect(container.firstChild).toHaveClass("bg-bordeaux-600/30");
  });
});
