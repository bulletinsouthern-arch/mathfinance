import { beforeEach, it, expect, vi } from "vitest";
const { sql, readCourseAccess } = vi.hoisted(() => ({ sql: vi.fn(), readCourseAccess: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/lib/course-access.server", () => ({ readCourseAccess }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (d: any) => d;
    const c: any = {
      middleware: () => c,
      inputValidator: (p: any) => {
        parse = p;
        return c;
      },
      handler: (h: any) => (a: any) => h({ ...a, data: parse(a.data) }),
    };
    return c;
  },
}));
import { courseCertificate } from "@/lib/certificates.functions";
import { verifiedCertificate } from "@/lib/certificates.server";
const courseId = "00000000-0000-4000-8000-000000000001";
const call = (issue = true) =>
  (courseCertificate as any)({
    data: { courseId, issue },
    context: { userId: "student", supabase: {} },
  });
beforeEach(() => {
  vi.clearAllMocks();
  readCourseAccess.mockResolvedValue({ allowed: true });
  sql.mockResolvedValue([]);
});
it("does not award certificates for empty courses or partially completed assessments", async () => {
  for (const progress of [
    { total: 0, passed: 0 },
    { total: 4, passed: 3 },
  ]) {
    sql.mockReset().mockResolvedValueOnce([progress]);
    await expect(call()).rejects.toThrow("Pass every course quiz");
    expect(sql).toHaveBeenCalledTimes(1);
  }
});
it("requires course access before issuing a credential", async () => {
  sql.mockResolvedValueOnce([{ total: 4, passed: 4 }]);
  readCourseAccess.mockResolvedValueOnce({ allowed: false });
  await expect(call()).rejects.toThrow("Course access required");
  expect(sql).toHaveBeenCalledTimes(1);
});
it("requires a saved student name rather than accepting a name from the browser", async () => {
  sql.mockResolvedValueOnce([{ total: 4, passed: 4 }]).mockResolvedValueOnce([]);
  await expect(call()).rejects.toThrow("first and last name");
  expect(sql).toHaveBeenCalledTimes(2);
});
it("issues one persistent certificate from saved results and server-side names", async () => {
  sql
    .mockResolvedValueOnce([{ total: 4, passed: 4 }])
    .mockResolvedValueOnce([{ first_name: "Ada", last_name: "Lovelace" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        id: "cert",
        student_name: "Ada Lovelace",
        course_title: "Finance",
        issued_at: "2026-10-29",
      },
    ]);
  expect(await call()).toMatchObject({
    eligible: true,
    certificate: { studentName: "Ada Lovelace", courseTitle: "Finance" },
  });
  expect(sql.mock.calls[2]![0].join("")).toContain("ON CONFLICT(user_id,course_id) DO NOTHING");
  expect(sql.mock.calls[2]!.slice(1)).toEqual(["student", "Ada Lovelace", courseId]);
});
it("invalidates public verification when assessment eligibility is no longer met", async () => {
  sql
    .mockResolvedValueOnce([{ id: "cert", user_id: "student", course_id: courseId }])
    .mockResolvedValueOnce([{ total: 5, passed: 4 }]);
  expect(await verifiedCertificate("cert")).toBeNull();
});
