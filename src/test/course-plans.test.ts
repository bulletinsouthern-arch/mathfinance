import { beforeEach, expect, it, vi } from "vitest";
const { sql, requireProctor, sync } = vi.hoisted(() => ({ sql: vi.fn(), requireProctor: vi.fn(), sync: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/lib/proctor.server", () => ({ requireProctor }));
vi.mock("@/lib/course-plan-protection.server", () => ({ syncCoursePlanProtection: sync }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let parse = (d: any) => d;
  const c: any = { middleware: () => c, inputValidator: (v: any) => { parse = v; return c; }, handler: (h: any) => (a: any) => h({ ...a, data: parse(a.data) }) };
  return c;
} }));
import { coursePlans } from "@/lib/course-plans.functions";
const courseId = "00000000-0000-4000-8000-000000000001";
const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: courseId } }) };
const context = { userId: "admin", supabase: { from: () => q } };
beforeEach(() => { vi.clearAllMocks(); requireProctor.mockResolvedValue(undefined); sync.mockResolvedValue(undefined); sql.mockResolvedValue([]); });
it("saves prices without accessing PayMongo or requiring legacy protection", async () => {
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ monthly: "250", yearly: "2400" }]);
  expect(await (coursePlans as any)({ context, data: { courseId, monthly: 250, yearly: 2400 } })).toEqual({ monthly: 250, yearly: 2400 });
  expect(sql.mock.calls[0]!.slice(1)).toEqual([courseId, 250, 2400]);
  expect(sync).toHaveBeenCalledWith(courseId, true);
});
it("saves disabled plans without any payment gateway", async () => {
  await (coursePlans as any)({ context, data: { courseId, monthly: 0, yearly: 0 } });
  expect(sync).toHaveBeenCalledWith(courseId, false);
});
it("rejects partial updates instead of silently ignoring a supplied price", async () => {
  expect(() => (coursePlans as any)({ context, data: { courseId, monthly: 50 } })).toThrow("Provide both");
  expect(sql).not.toHaveBeenCalled();
});
it("requires admin access before writing pricing", async () => {
  requireProctor.mockRejectedValue(new Error("Forbidden"));
  await expect((coursePlans as any)({ context, data: { courseId, monthly: 50, yearly: 500 } })).rejects.toThrow("Forbidden");
  expect(sql).not.toHaveBeenCalled();
});
