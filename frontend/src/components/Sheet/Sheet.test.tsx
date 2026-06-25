import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet } from "./Sheet";

const open = (over = {}) => ({
  open: true,
  title: "Ma feuille",
  onClose: vi.fn(),
  ...over,
});

describe("Sheet", () => {
  it("fermée : ne rend rien", () => {
    render(
      <Sheet open={false} title="X" onClose={vi.fn()}>
        <p>contenu</p>
      </Sheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("contenu")).toBeNull();
  });

  it("ouverte : dialog modale avec titre + contenu", () => {
    render(
      <Sheet {...open()}>
        <p>contenu</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Ma feuille");
    expect(screen.getByText("contenu")).toBeInTheDocument();
  });

  it("Échap ferme (onClose)", async () => {
    const onClose = vi.fn();
    render(
      <Sheet {...open({ onClose })}>
        <p>x</p>
      </Sheet>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("la croix « Fermer » ferme (onClose)", async () => {
    const onClose = vi.fn();
    render(
      <Sheet {...open({ onClose })}>
        <p>x</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
