import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaLightbox } from "./MediaLightbox";
import type { BlogPostMedia } from "../BlogPost/BlogPost";

const media: BlogPostMedia[] = [
  { src: "data:,a", alt: "a" },
  { src: "data:,b", alt: "b" },
  { src: "data:,c", alt: "c" },
];

describe("MediaLightbox", () => {
  it("fermé → ne rend rien", () => {
    const { container } = render(
      <MediaLightbox
        open={false}
        media={media}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("un seul média → pas de compteur ni de flèches", () => {
    render(
      <MediaLightbox
        open
        media={[media[0]]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
    expect(screen.queryByRole("button", { name: /précédent|suivant/i })).toBeNull();
  });

  it("plusieurs médias → compteur, et pas de flèche « précédent » sur le premier", () => {
    render(
      <MediaLightbox
        open
        media={media}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /précédent/i })).toBeNull();
    expect(screen.getByRole("button", { name: /suivant/i })).toBeInTheDocument();
  });

  it("bouton suivant → appelle onIndexChange avec l'index suivant", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onIndexChange = vi.fn();
    render(
      <MediaLightbox
        open
        media={media}
        index={0}
        onIndexChange={onIndexChange}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /suivant/i }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("dernier média → pas de flèche « suivant »", () => {
    render(
      <MediaLightbox
        open
        media={media}
        index={2}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /suivant/i })).toBeNull();
    expect(screen.getByRole("button", { name: /précédent/i })).toBeInTheDocument();
  });

  it("Échap → ferme", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onClose = vi.fn();
    render(
      <MediaLightbox
        open
        media={media}
        index={0}
        onIndexChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("bouton ✕ → ferme", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onClose = vi.fn();
    render(
      <MediaLightbox
        open
        media={media}
        index={0}
        onIndexChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /fermer/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("MediaLightbox — rotation manuelle (médias paysage)", () => {
  const landscape: BlogPostMedia = { src: "data:,l", alt: "paysage", width: 1200, height: 630 };
  const portrait: BlogPostMedia = { src: "data:,p", alt: "portrait", width: 630, height: 1200 };

  it("média portrait → bouton toujours monté mais invisible", () => {
    render(
      <MediaLightbox
        open
        media={[portrait]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: /pivoter/i });
    expect(btn.className).toMatch(/opacity-0/);
    expect(btn.className).toMatch(/pointer-events-none/);
  });

  it("média paysage → bouton visible et cliquable", () => {
    render(
      <MediaLightbox
        open
        media={[landscape]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: /pivoter/i });
    expect(btn.className).toMatch(/opacity-100/);
    expect(btn.className).not.toMatch(/pointer-events-none/);
  });

  it("clic sur le bouton → aria-pressed bascule", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(
      <MediaLightbox
        open
        media={[landscape]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: /pivoter/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("changement de média → réinitialise la rotation", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const { rerender } = render(
      <MediaLightbox
        open
        media={[landscape, landscape]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /pivoter/i }));
    expect(screen.getByRole("button", { name: /pivoter/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    rerender(
      <MediaLightbox
        open
        media={[landscape, landscape]}
        index={1}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /pivoter/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
