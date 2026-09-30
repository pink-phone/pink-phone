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
    expect(
      screen.getAllByRole("button", { name: /maintenir pour révéler/i }),
    ).toHaveLength(1);
  });

  it("plusieurs médias → un SafeMedia par média (carrousel)", () => {
    render(<MediaGallery media={[m("a"), m("b"), m("c")]} />);
    expect(
      screen.getAllByRole("button", { name: /maintenir pour révéler/i }),
    ).toHaveLength(3);
  });

  it("chaque média a un bouton « agrandir » qui ouvre la lightbox à son index", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<MediaGallery media={[m("a"), m("b")]} />);
    expect(
      screen.getAllByRole("button", { name: /plein écran/i }),
    ).toHaveLength(2);

    await userEvent.click(
      screen.getAllByRole("button", { name: /plein écran/i })[1],
    );
    expect(
      screen.getByRole("dialog", { name: /plein écran/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("média éphémère → pas de bouton « agrandir »", () => {
    render(<MediaGallery media={[{ ...m("a"), viewOnce: true }]} />);
    expect(screen.queryByRole("button", { name: /plein écran/i })).toBeNull();
  });
});
