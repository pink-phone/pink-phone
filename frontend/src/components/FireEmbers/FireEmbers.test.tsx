import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FireEmbers } from "./FireEmbers";

describe("FireEmbers", () => {
  it("rend `count` particules dans un conteneur décoratif (aria-hidden)", () => {
    const { container } = render(<FireEmbers count={4} />);
    const wrapper = container.querySelector(".fire-embers");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("aria-hidden");
    // Une particule par `count` (les <span> enfants directs du conteneur).
    expect(wrapper!.querySelectorAll(":scope > span")).toHaveLength(4);
  });

  it("densité par défaut = 6 particules", () => {
    const { container } = render(<FireEmbers />);
    const wrapper = container.querySelector(".fire-embers")!;
    expect(wrapper.querySelectorAll(":scope > span")).toHaveLength(6);
  });
});
