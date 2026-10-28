import { afterEach, describe, expect, it, vi } from "vitest";
import { getOllamaApiKey } from "@/lib/ai-env.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server AI environment", () => {
  it("prefers Netlify runtime credentials", () => {
    vi.stubGlobal("Netlify", { env: { get: () => " runtime-test-value " } });
    vi.stubEnv("OLLAMA_API_KEY", "process-test-value");
    expect(getOllamaApiKey()).toBe("runtime-test-value");
  });

  it("supports the process environment outside Netlify", () => {
    vi.stubGlobal("Netlify", undefined);
    vi.stubEnv("OLLAMA_API_KEY", " process-test-value ");
    expect(getOllamaApiKey()).toBe("process-test-value");
  });

  it("returns empty when no credential exists", () => {
    vi.stubGlobal("Netlify", undefined);
    vi.stubEnv("OLLAMA_API_KEY", "");
    expect(getOllamaApiKey()).toBe("");
  });
});
