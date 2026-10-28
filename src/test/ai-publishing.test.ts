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
    ).toMatchObject({ ok: false, error: expect.stringContaining("Try fewer questions") });
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
