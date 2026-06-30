import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { LoveNoteWall } from "./LoveNoteWall";
import type { ApiLoveNote } from "../../api/types";

const note = (over: Partial<ApiLoveNote> & { id: string }): ApiLoveNote => ({
  authorId: "u2",
  authorName: "Camille",
  body: "coucou",
  sealed: false,
  openAt: null,
  createdAt: "2026-06-29T20:00:00.000Z",
  ...over,
});

describe("LoveNoteWall", () => {
  it("état vide : message dédié", () => {
    render(<LoveNoteWall notes={[]} userId="u1" />);
    expect(screen.getByText(/Aucun mot pour l'instant/i)).toBeInTheDocument();
  });

  it("rend une carte par mot", () => {
    render(
      <LoveNoteWall
        notes={[note({ id: "n1", body: "premier" }), note({ id: "n2", body: "second" })]}
        userId="u1"
      />,
    );
    expect(screen.getByText("premier")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("le bouton « écrire » appelle onCompose (n'écrit pas en ligne)", async () => {
    const onCompose = vi.fn();
    render(<LoveNoteWall notes={[]} userId="u1" onCompose={onCompose} />);
    // Pas de zone de saisie sur le mur : l'écriture passe par le bouton.
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /un mot/i }));
    expect(onCompose).toHaveBeenCalledTimes(1);
  });
});
