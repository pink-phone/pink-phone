import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { LockGate } from "./LockGate";
import { setPin } from "../lib/pin";

function Draft() {
  const [v, setV] = useState("");
  return (
    <textarea
      aria-label="draft"
      value={v}
      onChange={(e) => setV(e.target.value)}
    />
  );
}

function goToBackground() {
  Object.defineProperty(document, "visibilityState", {
    value: "hidden",
    configurable: true,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
}

describe("LockGate", () => {
  beforeEach(() => localStorage.clear());

  it("est transparent sans PIN", () => {
    render(
      <LockGate>
        <Draft />
      </LockGate>,
    );
    expect(screen.getByLabelText("draft")).toBeTruthy();
  });

  it("garde l'état de l'app (brouillon) quand on re-verrouille", async () => {
    await setPin("1234");
    const { container } = render(
      <LockGate>
        <Draft />
      </LockGate>,
    );
    // Démarre verrouillé : l'app n'est pas encore montée.
    expect(screen.queryByLabelText("draft")).toBeNull();
    for (const d of "1234") {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }
    const field = await waitFor(() => screen.getByLabelText("draft"));
    fireEvent.change(field, { target: { value: "mon brouillon" } });

    goToBackground();

    // Re-verrouillé, mais l'app reste montée (inerte) avec son état.
    expect(container.querySelector("[inert]")).not.toBeNull();
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement).value,
    ).toBe("mon brouillon");
  });
});
