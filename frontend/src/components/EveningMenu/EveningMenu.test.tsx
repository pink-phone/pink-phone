import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EveningMenu } from "./EveningMenu";
import type { ApiEveningMenuItem } from "../../api/types";

const it_ = (code: string, over: Partial<ApiEveningMenuItem> = {}): ApiEveningMenuItem => ({
  code,
  picked: false,
  matched: false,
  ...over,
});

describe("EveningMenu", () => {
  it("rend une puce par item connu (libellé i18n)", () => {
    render(<EveningMenu items={[it_("massage"), it_("movie")]} />);
    expect(screen.getByText("Un massage")).toBeInTheDocument();
    expect(screen.getByText(/film/i)).toBeInTheDocument();
  });

  it("ignore les codes inconnus", () => {
    render(<EveningMenu items={[it_("massage"), it_("zzz")]} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("aria-pressed reflète mon choix", () => {
    render(<EveningMenu items={[it_("massage", { picked: true })]} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("affiche le compteur de matchs quand il y en a", () => {
    render(<EveningMenu items={[it_("massage", { picked: true, matched: true })]} />);
    // Le badge porte « ✨ N match(s) » (≠ le mot « match » de l'intro).
    expect(screen.getByText(/\d+ match/i)).toBeInTheDocument();
  });

  it("pas de compteur sans match", () => {
    render(<EveningMenu items={[it_("massage", { picked: true })]} />);
    expect(screen.queryByText(/\d+ match/i)).toBeNull();
  });

  it("clic appelle onToggle avec le code", async () => {
    const onToggle = vi.fn();
    render(<EveningMenu items={[it_("massage")]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith("massage");
  });
});
