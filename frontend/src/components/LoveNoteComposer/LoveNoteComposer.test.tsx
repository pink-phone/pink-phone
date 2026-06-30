import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { LoveNoteComposer } from "./LoveNoteComposer";

describe("LoveNoteComposer", () => {
  it("envoie le texte puis vide le brouillon et notifie onSent", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const onSent = vi.fn();
    render(<LoveNoteComposer onSend={onSend} onSent={onSent} />);
    const ta = screen.getByRole("textbox");
    await userEvent.type(ta, "je t'aime");
    await userEvent.click(screen.getByRole("button", { name: /envoyer/i }));
    expect(onSend).toHaveBeenCalledWith("je t'aime", undefined);
    expect((ta as HTMLTextAreaElement).value).toBe("");
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("bouton désactivé tant que le mot est vide", () => {
    render(<LoveNoteComposer onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: /envoyer/i })).toBeDisabled();
  });

  it("ne notifie pas onSent si l'envoi échoue", async () => {
    const onSent = vi.fn();
    render(<LoveNoteComposer onSend={() => false} onSent={onSent} />);
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.click(screen.getByRole("button", { name: /envoyer/i }));
    expect(onSent).not.toHaveBeenCalled();
  });
});
