import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { UndoToast } from "./UndoToast";

afterEach(() => vi.useRealTimers());

describe("UndoToast", () => {
  it("affiche le message et déclenche l'action", async () => {
    const onAction = vi.fn();
    render(
      <UndoToast message="Retiré" actionLabel="Annuler" onAction={onAction} onDismiss={vi.fn()} duration={0} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Retiré");
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("se ferme après la durée", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <UndoToast message="x" actionLabel="Annuler" onAction={vi.fn()} onDismiss={onDismiss} duration={1000} />,
    );
    act(() => vi.advanceTimersByTime(999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("le minuteur est en pause quand le bouton a le focus", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <UndoToast message="x" actionLabel="Annuler" onAction={vi.fn()} onDismiss={onDismiss} duration={1000} />,
    );
    act(() => screen.getByRole("button").focus());
    act(() => vi.advanceTimersByTime(5000));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
