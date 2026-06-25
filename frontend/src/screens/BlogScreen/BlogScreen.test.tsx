import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlogScreen } from "./BlogScreen";
import type { PostData } from "../../types/view";

const post = (id: string): PostData => ({
  id,
  author: { name: "Alex", glyph: "A" },
  timeLabel: "hier",
  body: `Récit ${id}`,
  media: [],
  reactionCounts: {},
  myReactions: [],
  verdict: null,
  commentCount: 0,
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
});
