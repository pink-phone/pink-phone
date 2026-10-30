import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("../components/InstallBanner/InstallBanner", () => ({
  InstallBanner: (p: { mode: string; onInstall: () => void; onDismiss: () => void }) => (
    <div>
      <span data-testid="mode">{p.mode}</span>
      <button onClick={p.onInstall}>install</button>
      <button onClick={p.onDismiss}>dismiss</button>
    </div>
  ),
}));

import { InstallPrompt } from "./InstallPrompt";

function stubMatchMedia(standalone: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: standalone && q.includes("standalone"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: ua });
}

function fireBeforeInstall() {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia(false);
  setUserAgent("Mozilla/5.0 (X11; Linux) Chrome");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InstallPrompt", () => {
  it("rien tant qu'aucun événement n'arrive", () => {
    render(<InstallPrompt />);
    expect(screen.queryByTestId("mode")).not.toBeInTheDocument();
  });

  it("rien si déjà installée (standalone)", () => {
    stubMatchMedia(true);
    render(<InstallPrompt />);
    fireBeforeInstall();
    expect(screen.queryByTestId("mode")).not.toBeInTheDocument();
  });

  it("rien si déjà refusée", () => {
    localStorage.setItem("pp_install_dismissed", "1");
    render(<InstallPrompt />);
    fireBeforeInstall();
    expect(screen.queryByTestId("mode")).not.toBeInTheDocument();
  });

  it("Android : capte beforeinstallprompt, installe via le prompt natif", async () => {
    render(<InstallPrompt />);
    const e = fireBeforeInstall();
    expect(e.defaultPrevented).toBe(true);
    expect(screen.getByTestId("mode")).toHaveTextContent("android");
    await act(async () => {
      screen.getByText("install").click();
    });
    expect(e.prompt).toHaveBeenCalled();
    expect(screen.queryByTestId("mode")).not.toBeInTheDocument();
  });

  it("refuser mémorise le choix et masque la bannière", () => {
    render(<InstallPrompt />);
    fireBeforeInstall();
    act(() => screen.getByText("dismiss").click());
    expect(localStorage.getItem("pp_install_dismissed")).toBe("1");
    expect(screen.queryByTestId("mode")).not.toBeInTheDocument();
  });

  it("iOS : instructions affichées après un délai ; install sans prompt = no-op", async () => {
    vi.useFakeTimers();
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    render(<InstallPrompt />);
    expect(screen.queryByTestId("mode")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("ios");
    await act(async () => {
      screen.getByText("install").click();
    });
    expect(screen.getByTestId("mode")).toBeInTheDocument();
  });

  it("appinstalled masque et mémorise", () => {
    render(<InstallPrompt />);
    fireBeforeInstall();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByTestId("mode")).not.toBeInTheDocument();
    expect(localStorage.getItem("pp_install_dismissed")).toBe("1");
  });
});
