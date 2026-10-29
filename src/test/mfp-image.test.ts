import { expect, it, vi, afterEach } from "vitest";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (data: unknown) => unknown;
    const chain = {
      middleware: () => chain,
      inputValidator: (fn: typeof validate) => { validate = fn; return chain; },
      handler: (fn: (context: unknown) => unknown) => (data: unknown) => fn({ data: validate(data) }),
    };
    return chain;
  },
}));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { mfpCreateImage } from "@/lib/mfp-image.functions";
const createImage = mfpCreateImage as unknown as (data: unknown) => Promise<any>;

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("passes the reference photo to the image model and returns a downloadable result", async () => {
  vi.stubEnv("NETLIFY_AI_GATEWAY_URL", "https://example.test/");
  generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YWJj" } }] } }] });
  const result = await createImage({ prompt: "A realistic garden", reference: "data:image/jpeg;base64,YWJj" });
  expect(result.ok).toBe(true);
  expect(result.image).toBe("data:image/png;base64,YWJj");
  expect(generateContent.mock.calls[0]![0].contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "YWJj" } });
});

it("handles text-only model responses without inventing an image", async () => {
  vi.stubEnv("NETLIFY_AI_GATEWAY_URL", "https://example.test/");
  generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: "Unable to generate" }] } }] });
  expect((await createImage({ prompt: "Draw a garden" })).ok).toBe(false);
});

it("rejects non-image reference payloads before inference", () => {
  expect(() => createImage({ prompt: "Edit this", reference: "data:text/html;base64,YWJj" })).toThrow();
  expect(generateContent).not.toHaveBeenCalled();
});
