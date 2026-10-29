import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const coursePlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        courseId: z.string().uuid(),
        monthly: z.number().min(0).max(1000000).optional(),
        yearly: z.number().min(0).max(1000000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.monthly !== undefined && data.yearly !== undefined) {
      const { requireProctor } = await import("./proctor.server");
      await requireProctor(context);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: policyError } = await (supabaseAdmin as any)
        .from("courses")
        .update({ paid_plan_required: data.monthly > 0 || data.yearly > 0 })
        .eq("id", data.courseId);
      if (policyError)
        throw new Error(
          "Payment protection migration is not available. Payment plans were not saved.",
        );
      await db.sql`INSERT INTO course_payment_plans(course_id,monthly,yearly) VALUES(${data.courseId},${data.monthly},${data.yearly}) ON CONFLICT(course_id) DO UPDATE SET monthly=EXCLUDED.monthly,yearly=EXCLUDED.yearly`;
    }
    const rows =
      await db.sql`SELECT monthly,yearly FROM course_payment_plans WHERE course_id=${data.courseId}`;
    return { monthly: Number(rows[0]?.["monthly"] ?? 0), yearly: Number(rows[0]?.["yearly"] ?? 0) };
  });
export const courseAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { readCourseAccess } = await import("./course-access.server");
    return readCourseAccess(context, data.courseId);
  });
export const cameraOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ quizId: z.string().uuid(), required: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.required !== undefined) {
      const { requireProctor } = await import("./proctor.server");
      await requireProctor(context);
      await db.sql`INSERT INTO assessment_camera_options(quiz_id,required) VALUES(${data.quizId},${data.required}) ON CONFLICT(quiz_id) DO UPDATE SET required=EXCLUDED.required`;
    }
    const rows =
      await db.sql`SELECT required FROM assessment_camera_options WHERE quiz_id=${data.quizId}`;
    return rows[0]?.["required"] !== false;
  });
