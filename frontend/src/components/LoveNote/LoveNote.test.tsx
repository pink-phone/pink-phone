import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { LoveNote } from "./LoveNote";

describe("LoveNote", () => {
  it("affiche le corps d'un mot lisible", () => {
    render(<LoveNote authorName="Camille" body="Coucou toi" sealed={false} />);
    expect(screen.getByText("Coucou toi")).toBeInTheDocument();
  });

  it("scellé : cache le corps et montre le teaser", () => {
    render(
      <LoveNote
        authorName="Camille"
        body={null}
        sealed
        openAt="2099-01-01T09:00:00.000Z"
      />,
    );
    expect(screen.queryByText(/Coucou/)).toBeNull();
    // Le cadenas + le libellé « scellé » sont là (texte i18n FR).
    expect(screen.getByText(/surprise|scellé/i)).toBeInTheDocument();
  });

  it("mien : bouton de suppression qui appelle onDelete", async () => {
    const onDelete = vi.fn();
    render(
      <LoveNote
        authorName="Toi"
        body="x"
        sealed={false}
        isMine
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("pas mien : pas de bouton de suppression", () => {
    render(<LoveNote authorName="Camille" body="x" sealed={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
