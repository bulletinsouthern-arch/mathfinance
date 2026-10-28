import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const unitNumberSchema = z.string().trim().min(1).max(100).regex(/^\d+(?:\.\d+)*$/, "Use a number such as 1, 1.2, or 2.10");

export const listUnitNumbers = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getDatabase } = await import("@netlify/database");
    const rows = await getDatabase().sql`SELECT unit_id, number FROM course_unit_numbers WHERE course_id = ${data.courseId}`;
    return Object.fromEntries(rows.map((r) => [String(r["unit_id"]), String(r["number"])])) as Record<string, string>;
  });

export const saveUnitNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ courseId: z.string().uuid(), unitId: z.string().uuid(), number: unitNumberSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Forbidden");
    const { getDatabase } = await import("@netlify/database");
    await getDatabase().sql`
      INSERT INTO course_unit_numbers (unit_id, course_id, number)
      VALUES (${data.unitId}, ${data.courseId}, ${data.number})
      ON CONFLICT (unit_id) DO UPDATE SET number = EXCLUDED.number, course_id = EXCLUDED.course_id
    `;
    return { ok: true };
  });
