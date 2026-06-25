import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("rend les 3 onglets, marque l'actif (aria-current)", () => {
    render(<BottomNav active="blog" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Accueil/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Défis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Blog/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("clic sur un onglet → onChange(id)", async () => {
    const onChange = vi.fn();
    render(<BottomNav active="dashboard" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Défis/ }));
    expect(onChange).toHaveBeenCalledWith("challenges");
  });

  it("affiche la pastille de nouveautés", () => {
    render(
      <BottomNav active="dashboard" onChange={vi.fn()} badges={{ blog: 3 }} />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
