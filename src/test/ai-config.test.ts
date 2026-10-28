import { describe, expect, it } from "vitest";
import { resolveAiEndpoint, resolveAiModel } from "@/lib/settings";

describe("AI Endpoint and Model sanitization", () => {
  it("resolves valid API endpoints", () => {
    expect(resolveAiEndpoint("https://ollama.com/api/chat")).toBe("https://ollama.com/api/chat");
    expect(resolveAiEndpoint("https://api.openai.com/v1/chat/completions")).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("safely falls back when given web URLs like chatgpt.com", () => {
    expect(resolveAiEndpoint("https://www.chatgpt.com")).toBe("https://ollama.com/api/chat");
    expect(resolveAiEndpoint("https://chatgpt.com")).toBe("https://ollama.com/api/chat");
    expect(resolveAiEndpoint("https://claude.ai")).toBe("https://ollama.com/api/chat");
    expect(resolveAiEndpoint("")).toBe("https://ollama.com/api/chat");
    expect(resolveAiEndpoint(undefined)).toBe("https://ollama.com/api/chat");
  });

  it("resolves valid model names", () => {
    expect(resolveAiModel("gpt-oss:120b")).toBe("gpt-oss:120b");
    expect(resolveAiModel("llama3.3")).toBe("llama3.3");
  });

  it("safely falls back when given display labels like MFP Assistant", () => {
    expect(resolveAiModel("MFP Assistant")).toBe("gpt-oss:120b");
    expect(resolveAiModel("assistant")).toBe("gpt-oss:120b");
    expect(resolveAiModel("")).toBe("gpt-oss:120b");
    expect(resolveAiModel(undefined)).toBe("gpt-oss:120b");
  });
});
