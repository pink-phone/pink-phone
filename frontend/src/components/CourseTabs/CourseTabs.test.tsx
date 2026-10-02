import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { CourseTabs } from "./CourseTabs";

const NEUTRAL = { starter: "neutral", main: "neutral", dessert: "neutral" } as const;

describe("CourseTabs", () => {
  it("affiche les 3 services, celui actif marqué aria-selected", () => {
    render(<CourseTabs active="main" statuses={NEUTRAL} onChange={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /plat/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /entrée/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("clic sur un service appelle onChange avec son id", async () => {
    const onChange = vi.fn();
    render(<CourseTabs active="starter" statuses={NEUTRAL} onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: /dessert/i }));
    expect(onChange).toHaveBeenCalledWith("dessert");
  });

  it("un service resté neutre n'affiche aucun badge de statut coché/matché", () => {
    render(<CourseTabs active="starter" statuses={NEUTRAL} onChange={vi.fn()} />);
    expect(screen.queryByText("✨")).toBeNull();
    expect(screen.queryByText("✓")).toBeNull();
  });

  it("tous les services accessibles même si un seul est matché (pas de verrouillage)", async () => {
    const onChange = vi.fn();
    render(
      <CourseTabs
        active="starter"
        statuses={{ starter: "matched", main: "neutral", dessert: "neutral" }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: /plat/i }));
    expect(onChange).toHaveBeenCalledWith("main");
  });
});
