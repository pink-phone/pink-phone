import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EveningMenuDone } from "./EveningMenuDone";

describe("EveningMenuDone", () => {
  it("à valider : bouton « J'ai fini » → onDone", async () => {
    const onDone = vi.fn();
    render(<EveningMenuDone meDone={false} revealed={false} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /j'ai fini/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("validé : en attente du prénom, « Modifier » → onUndo", async () => {
    const onUndo = vi.fn();
    render(<EveningMenuDone meDone revealed={false} partnerName="Alex" onUndo={onUndo} />);
    expect(screen.getByRole("status")).toHaveTextContent(/en attente de alex/i);
    await userEvent.click(screen.getByRole("button", { name: /modifier/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("dévoilé : message, plus aucun bouton (définitif)", () => {
    render(<EveningMenuDone meDone revealed partnerName="Alex" onUndo={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/dévoilés/i);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
