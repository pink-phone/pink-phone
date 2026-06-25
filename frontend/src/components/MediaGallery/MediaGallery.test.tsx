import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaGallery } from "./MediaGallery";
import type { BlogPostMedia } from "../BlogPost/BlogPost";

const m = (alt: string): BlogPostMedia => ({
  src: `https://example.test/${alt}.jpg`,
  alt,
  kind: "image",
});

describe("MediaGallery", () => {
  it("aucun média → ne rend rien", () => {
    const { container } = render(<MediaGallery media={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("un seul média → plein cadre (un seul SafeMedia)", () => {
    render(<MediaGallery media={[m("a")]} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("plusieurs médias → un SafeMedia par média (carrousel)", () => {
    render(<MediaGallery media={[m("a"), m("b"), m("c")]} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});
