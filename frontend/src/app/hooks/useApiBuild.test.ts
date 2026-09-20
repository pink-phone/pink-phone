import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as api from "../../api/client";
import { useApiBuild } from "./useApiBuild";

vi.mock("../../api/client", () => ({ getApiVersion: vi.fn() }));
const getApiVersion = vi.mocked(api.getApiVersion);

const build = { version: "0.0.147", commit: "432f3f5abcdef" };

describe("useApiBuild", () => {
  // Accolades : un `beforeEach` qui RETOURNE une fonction la fait exécuter comme
  // nettoyage après le test (ici : appeler le mock, dont le rejet resterait non géré).
  beforeEach(() => {
    getApiVersion.mockReset();
  });

  it("désactivé : aucune requête, reste en chargement", () => {
    const { result } = renderHook(() => useApiBuild(false));
    expect(result.current).toBe("loading");
    expect(getApiVersion).not.toHaveBeenCalled();
  });

  it("activé : charge la version de l'API", async () => {
    getApiVersion.mockResolvedValue(build);
    const { result } = renderHook(() => useApiBuild(true));
    expect(result.current).toBe("loading");
    await waitFor(() => expect(result.current).toEqual(build));
    expect(getApiVersion).toHaveBeenCalledTimes(1);
  });

  it("échec réseau → « unavailable » (jamais d'exception)", async () => {
    getApiVersion.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useApiBuild(true));
    await waitFor(() => expect(result.current).toBe("unavailable"));
  });

  it("relit à chaque réouverture (enabled false → true)", async () => {
    getApiVersion.mockResolvedValueOnce(build);
    const { result, rerender } = renderHook(({ on }) => useApiBuild(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current).toEqual(build));
    rerender({ on: false });
    getApiVersion.mockResolvedValueOnce({ version: "0.0.148", commit: "abc" });
    rerender({ on: true });
    await waitFor(() =>
      expect(result.current).toEqual({ version: "0.0.148", commit: "abc" }),
    );
    expect(getApiVersion).toHaveBeenCalledTimes(2);
  });
});
