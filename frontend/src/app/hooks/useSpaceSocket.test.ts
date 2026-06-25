import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSpaceSocket } from "./useSpaceSocket";

vi.mock("../../api/client", () => ({
  spaceSocketUrl: (spaceId: string, token: string) =>
    `ws://test/${spaceId}?token=${token}`,
}));

interface FakeWS {
  url: string;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
}

let instances: FakeWS[] = [];

beforeEach(() => {
  instances = [];
  vi.stubGlobal(
    "WebSocket",
    class {
      url: string;
      onmessage: FakeWS["onmessage"] = null;
      onclose: FakeWS["onclose"] = null;
      onerror: FakeWS["onerror"] = null;
      close = vi.fn();
      constructor(url: string) {
        this.url = url;
        instances.push(this as unknown as FakeWS);
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useSpaceSocket", () => {
  it("sans token : aucune connexion", () => {
    renderHook(() => useSpaceSocket("s1", null, vi.fn()));
    expect(instances).toHaveLength(0);
  });

  it("avec token : ouvre une connexion sur l'URL du salon", () => {
    renderHook(() => useSpaceSocket("s1", "tok", vi.fn()));
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe("ws://test/s1?token=tok");
  });

  it("un message {kind} appelle onEvent(kind) ; non-JSON / sans kind ignoré", () => {
    const onEvent = vi.fn();
    renderHook(() => useSpaceSocket("s1", "tok", onEvent));
    const ws = instances[0];
    ws.onmessage!({ data: JSON.stringify({ kind: "post" }) });
    expect(onEvent).toHaveBeenCalledWith("post");

    ws.onmessage!({ data: "pas du json" });
    ws.onmessage!({ data: JSON.stringify({ nope: 1 }) });
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("onEvent est lu via une ref (dernière valeur, sans reconnexion)", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useSpaceSocket("s1", "tok", cb),
      { initialProps: { cb: a } },
    );
    rerender({ cb: b });
    // Toujours la même connexion (pas de reconnexion au changement de callback).
    expect(instances).toHaveLength(1);
    instances[0].onmessage!({ data: JSON.stringify({ kind: "mood" }) });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith("mood");
  });

  it("reconnecte 3 s après une fermeture inattendue", () => {
    vi.useFakeTimers();
    renderHook(() => useSpaceSocket("s1", "tok", vi.fn()));
    expect(instances).toHaveLength(1);
    instances[0].onclose!();
    vi.advanceTimersByTime(3000);
    expect(instances).toHaveLength(2);
  });

  it("démontage : ferme la socket et ne reconnecte pas", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSpaceSocket("s1", "tok", vi.fn()));
    const ws = instances[0];
    unmount();
    expect(ws.close).toHaveBeenCalled();
    // Même si une fermeture survient après, pas de nouvelle connexion.
    vi.advanceTimersByTime(3000);
    expect(instances).toHaveLength(1);
  });
});
