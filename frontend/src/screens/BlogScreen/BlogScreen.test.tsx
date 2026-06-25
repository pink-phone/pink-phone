import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlogScreen } from "./BlogScreen";
import type { PostData } from "../../types/view";

const post = (id: string, over: Partial<PostData> = {}): PostData => ({
  id,
  author: { name: "Alex", glyph: "A" },
  timeLabel: "hier",
  body: `Récit ${id}`,
  media: [],
  reactionCounts: {},
  myReactions: [],
  verdict: null,
  commentCount: 0,
  ...over,
});

describe("BlogScreen", () => {
  it("liste vide : affiche le message d'invitation à écrire", () => {
    render(<BlogScreen posts={[]} />);
    expect(
      screen.getByText("Rien encore. Lance la première confidence…"),
    ).toBeInTheDocument();
  });

  it("hasMore absent : pas de bouton « Voir plus »", () => {
    render(<BlogScreen posts={[post("p1")]} hasMore={false} />);
    expect(
      screen.queryByRole("button", { name: /voir plus/i }),
    ).toBeNull();
  });

  it("hasMore=true : bouton « Voir plus » visible", () => {
    render(<BlogScreen posts={[post("p1")]} hasMore />);
    expect(
      screen.getByRole("button", { name: /voir plus/i }),
    ).toBeInTheDocument();
  });

  it("loadingMore=true : le bouton affiche « Chargement… » et est désactivé", () => {
    render(<BlogScreen posts={[post("p1")]} hasMore loadingMore />);
    const btn = screen.getByRole("button", { name: /chargement/i });
    expect(btn).toBeDisabled();
  });

  it("cliquer sur « Voir plus » appelle onLoadMore", async () => {
    const onLoadMore = vi.fn();
    render(
      <BlogScreen posts={[post("p1")]} hasMore onLoadMore={onLoadMore} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /voir plus/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("rend un post par entrée de la liste", () => {
    render(<BlogScreen posts={[post("p1"), post("p2")]} />);
    expect(screen.getByText("Récit p1")).toBeInTheDocument();
    expect(screen.getByText("Récit p2")).toBeInTheDocument();
  });

  it("brouillons (#91) : repliés par défaut, dépliés au clic", async () => {
    render(
      <BlogScreen
        posts={[
          post("d1", { draft: true, isMine: true }),
          post("p1"),
        ]}
      />,
    );
    // Le post publié est visible ; le brouillon est masqué (section repliée).
    expect(screen.getByText("Récit p1")).toBeInTheDocument();
    expect(screen.queryByText("Récit d1")).toBeNull();
    // Le bouton de section indique le nombre de brouillons.
    const toggle = screen.getByRole("button", { name: /Brouillon \(1\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Récit d1")).toBeInTheDocument();
  });
});
