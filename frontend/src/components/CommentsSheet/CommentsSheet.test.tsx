import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentsSheet, type CommentView } from "./CommentsSheet";

const comment = (id: string): CommentView => ({
  id,
  authorName: "Sam",
  body: `message ${id}`,
  timeLabel: "hier",
});

const base = {
  open: true,
  comments: [],
  onClose: vi.fn(),
  onAdd: vi.fn(),
};

describe("CommentsSheet", () => {
  it("liste vide : affiche le message d'absence de commentaires", () => {
    render(<CommentsSheet {...base} comments={[]} />);
    expect(
      screen.getByText("Personne n'a encore réagi. Lance la discussion."),
    ).toBeInTheDocument();
  });

  it("hasMore absent : pas de bouton « Messages plus anciens »", () => {
    render(
      <CommentsSheet {...base} comments={[comment("c1")]} hasMore={false} />,
    );
    expect(
      screen.queryByRole("button", { name: /messages plus anciens/i }),
    ).toBeNull();
  });

  it("hasMore=true : bouton « Messages plus anciens » visible", () => {
    render(
      <CommentsSheet {...base} comments={[comment("c1")]} hasMore />,
    );
    expect(
      screen.getByRole("button", { name: /messages plus anciens/i }),
    ).toBeInTheDocument();
  });

  it("loadingMore=true : bouton désactivé et affiche « Chargement… »", () => {
    render(
      <CommentsSheet
        {...base}
        comments={[comment("c1")]}
        hasMore
        loadingMore
      />,
    );
    const btn = screen.getByRole("button", { name: /chargement/i });
    expect(btn).toBeDisabled();
  });

  it("cliquer sur « Messages plus anciens » appelle onLoadMore", async () => {
    const onLoadMore = vi.fn();
    render(
      <CommentsSheet
        {...base}
        comments={[comment("c1")]}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /messages plus anciens/i }),
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("submit : onAdd reçoit le corps du message et le champ est vidé", async () => {
    const onAdd = vi.fn();
    render(<CommentsSheet {...base} comments={[comment("c1")]} onAdd={onAdd} />);

    const textarea = screen.getByLabelText("Ta réponse");
    await userEvent.type(textarea, "  bonjour  ");
    await userEvent.click(screen.getByRole("button", { name: /envoyer/i }));

    expect(onAdd).toHaveBeenCalledWith("bonjour");
    expect(textarea).toHaveValue("");
  });

  it("submit désactivé quand le champ est vide (espaces seuls)", async () => {
    render(<CommentsSheet {...base} comments={[comment("c1")]} />);
    const submit = screen.getByRole("button", { name: /envoyer/i });
    expect(submit).toBeDisabled();
  });

  it("busy=true : bouton Envoyer désactivé", () => {
    render(
      <CommentsSheet
        {...base}
        comments={[comment("c1")]}
        busy
      />,
    );
    // Le bouton affiche "…" et est désactivé.
    expect(screen.getByRole("button", { name: /…/ })).toBeDisabled();
  });
});
