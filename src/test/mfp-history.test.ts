import { afterEach, expect, it, vi } from "vitest";
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (data: any) => data;
    const chain: any = {
      middleware: () => chain,
      inputValidator: (validator: any) => { parse = validator; return chain; },
      handler: (handler: any) => (args: any) => handler({ ...args, data: parse(args.data) }),
    };
    return chain;
  },
}));
import { mfpHistory } from "@/lib/mfp-history.functions";
const run = (data: any) => (mfpHistory as any)({ data, context: { userId: "verified-owner" } });
const id = "00000000-0000-4000-8000-000000000001";
afterEach(() => vi.clearAllMocks());

it("loads history for the verified owner, ignoring client owner fields", async () => {
  sql.mockResolvedValueOnce([{ id, title: "My chat", messages: [{ role: "user", content: "Hello" }] }]);
  expect(await run({ action: "load", userId: "another-owner" })).toEqual([{ id, title: "My chat", msgs: [{ role: "user", content: "Hello" }] }]);
  expect(sql.mock.calls[0]!.slice(1)).toEqual(["verified-owner"]);
});

it("scopes writes and deletions to the verified account and excludes photo payloads", async () => {
  sql.mockResolvedValue([]);
  await run({ action: "save", chat: { id, title: "Photo", msgs: [{ role: "user", content: "Explain [photo]", image: "data:image/png;base64,private" }] } });
  expect(sql.mock.calls[0]![1]).toBe("verified-owner");
  expect(sql.mock.calls[0]![4]).not.toContain("base64");
  await run({ action: "delete", id, userId: "another-owner" });
  expect(sql.mock.calls[1]!.slice(1)).toEqual(["verified-owner", id]);
});
