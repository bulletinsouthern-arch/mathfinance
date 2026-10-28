import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerEnv } from "@/lib/server-env.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("server runtime configuration", () => {
  it("prefers Netlify runtime configuration", () => {
    vi.stubGlobal("Netlify", { env: { get: () => " runtime-value " } });
    vi.stubEnv("SERVER_ENV_TEST", "process-value");
    expect(getServerEnv("SERVER_ENV_TEST")).toBe("runtime-value");
  });
  it("falls back to the process environment", () => {
    vi.stubGlobal("Netlify", undefined);
    vi.stubEnv("SERVER_ENV_TEST", " process-value ");
    expect(getServerEnv("SERVER_ENV_TEST")).toBe("process-value");
  });
  it("handles missing optional configuration", () => {
    vi.stubGlobal("Netlify", undefined);
    vi.stubEnv("SERVER_ENV_TEST", "");
    expect(getServerEnv("SERVER_ENV_TEST")).toBe("");
  });
});
