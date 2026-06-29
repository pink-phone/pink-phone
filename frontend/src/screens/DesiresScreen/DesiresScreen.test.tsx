import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DesiresScreen } from "./DesiresScreen";
import type { ApiDesire } from "../../api/types";

const d = (code: string, over: Partial<ApiDesire> = {}): ApiDesire => ({
  code,
  interested: false,
  matched: false,
  ...over,
});

describe("DesiresScreen", () => {
  it("rend une carte par envie connue (libellé i18n)", () => {
    render(<DesiresScreen items={[d("massage"), d("shower")]} />);
    // Libellés FR (i18n booté en fr dans les tests).
    expect(screen.getByText("Massage sensuel")).toBeInTheDocument();
    expect(screen.getByText("Douche à deux")).toBeInTheDocument();
  });

  it("ignore les codes inconnus", () => {
    render(<DesiresScreen items={[d("massage"), d("zzz_inconnu")]} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("affiche la section « match » quand il y a une réciprocité", () => {
    render(
      <DesiresScreen
        items={[d("massage", { interested: true, matched: true }), d("shower")]}
      />,
    );
    expect(screen.getByText(/Vous êtes deux à vouloir/)).toBeInTheDocument();
    expect(screen.getByText(/Match/)).toBeInTheDocument();
  });

  it("pas de section match sans réciprocité", () => {
    render(<DesiresScreen items={[d("massage", { interested: true })]} />);
    expect(screen.queryByText(/Vous êtes deux à vouloir/)).toBeNull();
  });

  it("clic sur une carte appelle onToggle avec le code", async () => {
    const onToggle = vi.fn();
    render(<DesiresScreen items={[d("massage")]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: /tente/i }));
    expect(onToggle).toHaveBeenCalledWith("massage");
  });
});
