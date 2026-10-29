import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: any = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (h: any) => h,
    };
    return chain;
  },
}));
import { runChat } from "@/lib/ai.functions";
function settingsClient(url = "https://ollama.com/api/chat") {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [
            { key: "ai_url", value: url },
            { key: "ai_key", value: "test-credential" },
          ],
          error: null,
        }),
      }),
    }),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("AI publisher transport", () => {
  it.each([
    ["https://ollama.com/api/chat", { format: "json" }],
    ["https://example.com/v1/chat/completions", { response_format: { type: "json_object" } }],
  ])("requests structured JSON for %s", async (url, expected) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ message: { content: '{"name":"Formula"}' } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await runChat([{ role: "user", content: "Post" }], "Return JSON", {
      json: true,
      settingsClient: settingsClient(url),
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject(expected);
  });
  it("returns a safe credential error without exposing provider output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider detail", { status: 401 })),
    );
    const result = await runChat([{ role: "user", content: "Post" }], "JSON", {
      settingsClient: settingsClient(),
    });
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("rejected the configured key"),
    });
    expect(JSON.stringify(result)).not.toContain("private provider detail");
  });
  it("returns a retry message on a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(
      await runChat([{ role: "user", content: "Post" }], "JSON", {
        settingsClient: settingsClient(),
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("timed out") });
  });
  it("does not treat an empty response as successful content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: { content: "" } })));
    expect(
      await runChat([{ role: "user", content: "Post" }], "JSON", {
        settingsClient: settingsClient(),
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("no content") });
  });
});

it("keeps a whole textbook quiz and removes links even when its hidden prompt mentions URLs", async () => {
  const { buildQuizPrompt } = await import("@/lib/mfp-study");
  const prompt = buildQuizPrompt({ count: 5, difficulty: "Easy", format: "multiple-choice", topic: { code: "BUS101", title: "Business", textbook: "Stakeholders include customers. https://example.com/book" } });
  const batch = Array.from({ length: 5 }, (_, i) => `**Question ${i + 1} of 5**\nWho is a stakeholder?\nA. Customers\nB. Stars\nC. Planets\nD. Comets`).join("\n\n");
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ message: { content: `${batch}\nhttps://example.com/book` } })));
  vi.stubGlobal("fetch", fetcher);
  const result = await runChat([{ role: "user", content: prompt }], undefined, { settingsClient: settingsClient() });
  expect(result.ok && result.reply).toContain("Question 5 of 5");
  expect(result.ok && result.reply).not.toContain("https://");
  expect(fetcher.mock.calls.every(([url]) => url === "https://ollama.com/api/chat")).toBe(true);
});

it("answers an ordinary question with one concise model call and no web requests", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ message: { content: "Profit is revenue minus costs." } })));
  vi.stubGlobal("fetch", fetcher);
  const result = await runChat([{ role: "user", content: "What is profit?" }], undefined, { settingsClient: settingsClient() });
  expect(result).toEqual({ ok: true, reply: "Profit is revenue minus costs." });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.options.num_predict).toBe(512);
  expect(body.messages[0].content).toContain("about 40–100 words");
  expect(body.messages[0].content).not.toContain("Begin with a short roadmap");
});
