import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { generate, construct } = vi.hoisted(() => ({ generate: vi.fn(), construct: vi.fn() }));
vi.mock("openai", () => ({ default: class {
  constructor(options: unknown) { construct(options); }
  chat = { completions: { create: generate } };
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain: any = { middleware: () => chain, inputValidator: () => chain, handler: (handler: any) => handler };
  return chain;
} }));
import { runChat } from "@/lib/ai.functions";
import { DEEPSEEK_MODEL, requestAi } from "@/lib/ai-transport.server";
const answer = (content: string) => ({ choices: [{ message: { content } }] });
const settingsClient = (key = "test-search-key") => ({ from: () => ({ select: () => ({ in: async () => ({ data: [{ key: "ai_key", value: key }] }) }) }) });
beforeEach(() => {
  generate.mockReset(); construct.mockClear();
  vi.stubEnv("OLLAMA_API_KEY", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("uses V4 Flash for text with one concise request and no Ollama request", async () => {
  generate.mockResolvedValue(answer("Profit is revenue minus costs."));
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await runChat([{ role: "user", content: "What is profit?" }], undefined, { settingsClient: settingsClient() })).toEqual({ ok: true, reply: "Profit is revenue minus costs." });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0]![0]).toMatchObject({ model: DEEPSEEK_MODEL, max_tokens: 512 });
  expect(construct.mock.calls[0]![0]).not.toHaveProperty("apiKey");
  expect(construct.mock.calls[0]![0]).not.toHaveProperty("baseURL");
  expect(fetcher).not.toHaveBeenCalled();
});

it("passes fresh Ollama search evidence into DeepSeek without sharing the search key", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ results: [{ published_at: new Date().toISOString(), title: "Official report", url: "https://example.org/report", content: "The current exchange rate is 58 pesos per dollar." }] }));
  vi.stubGlobal("fetch", fetcher);
  generate.mockResolvedValue(answer("The report gives 58 pesos per dollar."));
  const result = await runChat([{ role: "user", content: "What is the exchange rate now?" }], undefined, { settingsClient: settingsClient() });
  expect(result.ok).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => url === "https://ollama.com/api/web_search")).toBe(true);
  expect(JSON.stringify(generate.mock.calls[0]![0])).toContain("58 pesos");
  expect(JSON.stringify(generate.mock.calls)).not.toContain("test-search-key");
});

it("falls back to the retained Ollama model when DeepSeek fails or returns empty text", async () => {
  generate.mockRejectedValueOnce(new Error("private provider failure")).mockResolvedValueOnce(answer(""));
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ message: { content: "Fallback answer" } }));
  vi.stubGlobal("fetch", fetcher);
  for (let i = 0; i < 2; i++) {
    const result = await requestAi("https://ollama.com/api/chat", "test-search-key", { model: "gpt-oss:120b", stream: false, messages: [{ role: "user", content: "Hello" }] }, 15000);
    expect(await result.json()).toEqual({ message: { content: "Fallback answer" } });
  }
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).model).toBe("gpt-oss:120b");
});

it("keeps structured authoring on DeepSeek with JSON output", async () => {
  generate.mockResolvedValue(answer('{"name":"Formula"}'));
  expect(await runChat([{ role: "user", content: "Create a formula" }], "Return JSON", { json: true, settingsClient: settingsClient() })).toEqual({ ok: true, reply: '{"name":"Formula"}' });
  expect(generate.mock.calls[0]![0]).toMatchObject({ model: DEEPSEEK_MODEL, response_format: { type: "json_object" } });
});

it("routes photos to Ollama vision without sending them to the text-only model", async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ message: { content: "The receipt total is 100 pesos." } }));
  vi.stubGlobal("fetch", fetcher);
  expect((await runChat([{ role: "user", content: "Explain this receipt", images: ["test-photo"] }], undefined, { settingsClient: settingsClient() })).ok).toBe(true);
  expect(generate).not.toHaveBeenCalled();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ model: "qwen3-vl:235b-cloud", messages: expect.arrayContaining([expect.objectContaining({ images: ["test-photo"] })]) });
});

it("keeps text available without an Ollama key and discloses missing live evidence", async () => {
  generate.mockResolvedValue(answer("I cannot verify the current exchange rate."));
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const result = await runChat([{ role: "user", content: "What is the exchange rate now?" }], undefined, { settingsClient: settingsClient("") });
  expect(result.ok && result.reply).toContain("Live web lookup unavailable");
  expect(fetcher).not.toHaveBeenCalled();
});
