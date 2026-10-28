import { beforeEach, describe, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (d: unknown) => unknown;
    const chain: any = {
      middleware: () => chain,
      inputValidator: (validator: typeof parse) => { parse = validator; return chain; },
      handler: (handler: any) => (args: any) => handler({ ...args, data: parse(args.data) }),
    };
    return chain;
  },
}));
import { listUnitNumbers, saveUnitNumber, unitNumberSchema } from "@/lib/unit-numbers.functions";
const courseId = "00000000-0000-4000-8000-000000000001";
const unitId = "00000000-0000-4000-8000-000000000002";
const save = (number: string, admin = true) => (saveUnitNumber as any)({
  data: { courseId, unitId, number },
  context: { userId: "admin", supabase: { rpc: async () => ({ data: admin, error: null }) } },
});
beforeEach(() => { sql.mockReset(); sql.mockResolvedValue([]); });
describe("editable unit numbering", () => {
  it.each(["1", "1.1", "1.2", "2.1", "2.10", "12.345.10", "0", "001.10"])("preserves %s exactly", (number) => {
    expect(unitNumberSchema.parse(number)).toBe(number);
  });
  it.each(["", "1..2", "-1", "1e3", "abc", "1."])("rejects invalid number %s", (number) => {
    expect(unitNumberSchema.safeParse(number).success).toBe(false);
  });
  it("saves 2.10 as text in a parameterized upsert", async () => {
    await save("2.10");
    expect(sql).toHaveBeenCalledOnce();
    expect(sql.mock.calls[0]!.slice(1)).toEqual([unitId, courseId, "2.10"]);
    expect(sql.mock.calls[0]![0].join("")).toContain("ON CONFLICT (unit_id) DO UPDATE");
  });
  it("rejects non-administrators before writing", async () => {
    await expect(save("2.10", false)).rejects.toThrow("Forbidden");
    expect(sql).not.toHaveBeenCalled();
  });
  it("returns saved numbers unchanged for the course reader", async () => {
    sql.mockResolvedValue([{ unit_id: unitId, number: "2.10" }]);
    await expect(listUnitNumbers({ data: { courseId } })).resolves.toEqual({ [unitId]: "2.10" });
    expect(sql.mock.calls[0]!.slice(1)).toEqual([courseId]);
  });
  it("surfaces storage failures for retry", async () => {
    sql.mockRejectedValue(new Error("Unavailable"));
    await expect(save("1.2")).rejects.toThrow("Unavailable");
  });
});
