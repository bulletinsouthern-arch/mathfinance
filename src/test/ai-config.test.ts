import { describe, expect, it } from "vitest";
import { resolveAiEndpoint, resolveAiModel, filterPublicSettings } from "@/lib/settings";

describe("AI Endpoint and Model sanitization", () => {
  it("resolves valid API endpoints", () => {
    expect(resolveAiEndpoint("https://ollama.com/api/chat")).toBe("https://ollama.com/api/chat");
    expect(resolveAiEndpoint("https://api.openai.com/v1/chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
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

  it("strictly filters sensitive keys from public settings", () => {
    const rawRows = [
      { key: "site_name", value: "Math & Finance Pro" },
      { key: "ai_url", value: "https://ollama.com/api/chat" },
      { key: "ai_model", value: "gpt-oss:120b" },
      { key: "ai_key", value: "secret-key-123" },
      { key: "ollama_api_key", value: "secret-key-456" },
      { key: "secret_key", value: "secret-key-789" },
    ];
    const filtered = filterPublicSettings(rawRows);
    expect(filtered["site_name"]).toBe("Math & Finance Pro");
    expect(filtered["ai_url"]).toBe("https://ollama.com/api/chat");
    expect(filtered["ai_model"]).toBe("gpt-oss:120b");
    expect(filtered["ai_key"]).toBeUndefined();
    expect(filtered["ollama_api_key"]).toBeUndefined();
    expect(filtered["secret_key"]).toBeUndefined();
  });
});
