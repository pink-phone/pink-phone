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
    render(<LoveNoteWall notes={[]} userId="u1" onSend={vi.fn()} />);
    // Message d'état vide (≠ le label « Laisse un petit mot » du composer).
    expect(screen.getByText(/Aucun mot pour l'instant/i)).toBeInTheDocument();
  });

  it("rend une carte par mot", () => {
    render(
      <LoveNoteWall
        notes={[note({ id: "n1", body: "premier" }), note({ id: "n2", body: "second" })]}
        userId="u1"
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByText("premier")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("envoyer un mot : onSend appelé avec le texte, puis le brouillon est vidé", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<LoveNoteWall notes={[]} userId="u1" onSend={onSend} />);
    const ta = screen.getByRole("textbox");
    await userEvent.type(ta, "je t'aime");
    await userEvent.click(screen.getByRole("button", { name: /envoyer/i }));
    expect(onSend).toHaveBeenCalledWith("je t'aime", undefined);
    expect((ta as HTMLTextAreaElement).value).toBe("");
  });

  it("le bouton envoyer est désactivé tant que le mot est vide", () => {
    render(<LoveNoteWall notes={[]} userId="u1" onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: /envoyer/i })).toBeDisabled();
  });
});
