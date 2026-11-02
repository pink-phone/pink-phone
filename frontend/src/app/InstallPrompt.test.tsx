import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

const UA = window.navigator.userAgent;
function setUa(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}
function standalone(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes("standalone"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}
function beforeInstall() {
  const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  ev.prompt = vi.fn().mockResolvedValue(undefined);
  ev.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
}

beforeEach(() => {
  localStorage.clear();
  standalone(false);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  setUa(UA);
});

describe("InstallPrompt", () => {
  it("rien tant qu'aucun signal d'installation n'est reçu", () => {
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("Android : capte beforeinstallprompt, installe via le prompt natif puis disparaît", async () => {
    render(<InstallPrompt />);
    const ev = beforeInstall();
    expect(ev.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /install/i }));
    expect(ev.prompt).toHaveBeenCalled();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /install/i })).toBeNull();
  });

  it("refuser mémorise le choix et masque la bannière", async () => {
    render(<InstallPrompt />);
    beforeInstall();
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[buttons.length - 1]);
    expect(localStorage.getItem("pp_install_dismissed")).toBe("1");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("iOS : propose les instructions après un délai (pas d'événement natif)", () => {
    setUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(container).not.toBeEmptyDOMElement();
  });

  it("déjà installée (standalone) : ne propose rien", () => {
    standalone(true);
    render(<InstallPrompt />);
    const ev = new Event("beforeinstallprompt", { cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("déjà refusée auparavant : ne propose plus", () => {
    localStorage.setItem("pp_install_dismissed", "1");
    render(<InstallPrompt />);
    const ev = new Event("beforeinstallprompt", { cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("appinstalled : masque la bannière et mémorise", () => {
    render(<InstallPrompt />);
    beforeInstall();
    expect(screen.queryAllByRole("button").length).toBeGreaterThan(0);
    act(() => {
      fireEvent(window, new Event("appinstalled"));
    });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(localStorage.getItem("pp_install_dismissed")).toBe("1");
  });
});
