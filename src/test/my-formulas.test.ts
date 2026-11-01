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
import { myFormulas } from "@/lib/my-formulas.functions";
const run = (data: any) => (myFormulas as any)({ data, context: { userId: "verified-owner" } });
const id = "00000000-0000-4000-8000-000000000001";
const formula = {
  id, name: "Revenue", expression: "Price * Units_Sold", outputLabel: "Revenue", outputUnit: "₱",
  color: "#1c6658", inputs: { Price: "250", Units_Sold: "100" }, scenarios: [{ name: "Slow month", change: -20 }],
};
afterEach(() => vi.clearAllMocks());

it("loads only the verified owner's formulas", async () => {
  sql.mockResolvedValueOnce([{ id, name: "Revenue", expression: "Price * Units_Sold", description: "", output_label: "Revenue",
    output_unit: "₱", color: "#1c6658", inputs: {}, scenarios: [{ name: "Slow month", change: -20 }] }]);
  const rows = await run({ action: "load", userId: "another-owner" });
  expect(rows[0].scenarios[0].name).toBe("Slow month");
  expect(sql.mock.calls[0]!.slice(1)).toEqual(["verified-owner", 200]);
});

it("scopes saves and deletions to the verified account", async () => {
  sql.mockResolvedValue([{ id }]);
  await run({ action: "save", formula: { ...formula, userId: "another-owner" } });
  expect(sql.mock.calls[0]![1]).toBe("verified-owner");
  await run({ action: "delete", id });
  expect(sql.mock.calls[1]!.slice(1)).toEqual(["verified-owner", id]);
});

it("rejects formulas that cannot be calculated and unsafe colors", () => {
  expect(() => run({ action: "save", formula: { ...formula, expression: "Price * (" } })).toThrow();
  expect(() => run({ action: "save", formula: { ...formula, color: "red;background:url(x)" } })).toThrow();
});

it("reports when the saved-formula limit is reached", async () => {
  sql.mockResolvedValueOnce([]);
  await expect(run({ action: "save", formula })).rejects.toThrow(/up to 200/);
});
