import { beforeEach, it, expect, vi } from "vitest";
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
import { readCourseAccess, assertQuizCourseAccess } from "@/lib/course-access.server";
function context(price = 0, admin = false, flag = false) {
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({
      data: { id: "course", price, paid_plan_required: flag, course_id: "course" },
    }),
  };
  return { userId: "student", supabase: { from: () => q, rpc: async () => ({ data: admin }) } };
}
beforeEach(() => sql.mockReset().mockResolvedValue([]));
it("allows free courses without a payment or enrollment", async () => {
  expect(await readCourseAccess(context(), "course")).toMatchObject({ allowed: true, paid: false });
});
it("does not treat an unverified enrollment as paid access", async () => {
  expect(await readCourseAccess(context(500), "course")).toMatchObject({
    allowed: false,
    paid: true,
  });
});
it("locks a monthly-only course even when its one-time price is zero", async () => {
  sql.mockResolvedValueOnce([{ monthly: 200, yearly: 1800 }]).mockResolvedValueOnce([]);
  expect(await readCourseAccess(context(), "course")).toMatchObject({
    allowed: false,
    paid: true,
    monthly: 200,
    yearly: 1800,
  });
});
it("fails closed when the paid-plan flag exists but plan data is missing", async () => {
  expect(await readCourseAccess(context(0, false, true), "course")).toMatchObject({
    allowed: false,
    paid: true,
  });
});
it("only uses active server-verified grants belonging to this user and course", async () => {
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ expires_at: "2027-01-01" }]);
  expect(await readCourseAccess(context(500), "course")).toMatchObject({
    allowed: true,
    expiresAt: "2027-01-01",
  });
  const [query, ...params] = sql.mock.calls[1]!;
  expect(query.join("")).toContain("expires_at>now()");
  expect(params).toEqual(["student", "course"]);
});
it("allows an administrator to review a paid course", async () => {
  expect(await readCourseAccess(context(500, true), "course")).toMatchObject({ allowed: true });
});
it("blocks a direct quiz URL for an unpaid course", async () => {
  await expect(assertQuizCourseAccess(context(500), "quiz")).rejects.toThrow("Payment required");
});
it("does not permit access when course lookup fails", async () => {
  const ctx = {
    userId: "student",
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "offline" } }) }),
        }),
      }),
    },
  };
  await expect(readCourseAccess(ctx, "course")).rejects.toThrow("Course unavailable");
});
