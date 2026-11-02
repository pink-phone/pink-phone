import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toast } from "./Toast";

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("affiche le message (role status)", () => {
    render(<Toast message="✨ Match ce soir !" duration={0} />);
    expect(screen.getByRole("status")).toHaveTextContent("Match ce soir");
  });

  it("s'auto-ferme après la durée", () => {
    const onDismiss = vi.fn();
    render(<Toast message="x" duration={3000} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("duration=0 : pas d'auto-fermeture", () => {
    const onDismiss = vi.fn();
    render(<Toast message="x" duration={0} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(10000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("clic ferme le toast", () => {
    const onDismiss = vi.fn();
    render(<Toast message="ferme-moi" duration={0} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("ferme-moi"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
