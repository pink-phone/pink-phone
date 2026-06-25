import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextMenu } from "./ContextMenu";

const items = (edit = vi.fn(), del = vi.fn()) => [
  { label: "Modifier", onClick: edit },
  { label: "Supprimer", onClick: del, danger: true },
];

describe("ContextMenu", () => {
  it("liste vide → ne rend rien", () => {
    const { container } = render(
      <ContextMenu items={[]} ariaLabel="Actions" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("fermé par défaut, le déclencheur expose aria-haspopup/expanded", () => {
    render(<ContextMenu items={items()} ariaLabel="Actions" />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clic sur le déclencheur ouvre le menu (rendu en portal)", async () => {
    render(<ContextMenu items={items()} ariaLabel="Actions" />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Modifier" })).toBeInTheDocument();
  });

  it("clic sur un item appelle son onClick et referme", async () => {
    const del = vi.fn();
    render(<ContextMenu items={items(vi.fn(), del)} ariaLabel="Actions" />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Supprimer" }));
    expect(del).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Échap referme le menu", async () => {
    render(<ContextMenu items={items()} ariaLabel="Actions" />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
