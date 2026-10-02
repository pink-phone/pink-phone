import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MenuMark } from "./MenuMark";

describe("MenuMark", () => {
  it("est décorative (aria-hidden)", () => {
    const { container } = render(<MenuMark state="mine" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    ["mine", "✓"],
    ["proposed", "＋"],
    ["match", "✨"],
    ["refused", "⊘"],
  ] as const)("état %s → glyphe %s", (state, glyph) => {
    const { container } = render(<MenuMark state={state} />);
    expect(container.textContent).toBe(glyph);
  });

  it("proposed = bordure pointillée, mine = plein", () => {
    const a = render(<MenuMark state="proposed" />).container.firstChild as HTMLElement;
    const b = render(<MenuMark state="mine" />).container.firstChild as HTMLElement;
    expect(a.className).toContain("border-dashed");
    expect(b.className).toContain("bg-spice-500");
  });
});
