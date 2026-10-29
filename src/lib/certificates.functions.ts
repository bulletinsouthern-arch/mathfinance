import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const courseCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ courseId: z.string().uuid(), issue: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    const { completionProgress } = await import("./certificates.server");
    const progress = await completionProgress(context.userId, data.courseId);
    if (data.issue) {
      const { readCourseAccess } = await import("./course-access.server");
      if (!(await readCourseAccess(context, data.courseId)).allowed)
        throw new Error("Course access required");
      if (!progress.eligible)
        throw new Error(
          "Pass every course quiz and exam before requesting a certificate. Flagged attempts require review.",
        );
      const names =
        await db.sql`SELECT first_name,last_name FROM mfp.student_names WHERE user_id=${context.userId} AND btrim(first_name)<>'' AND btrim(last_name)<>''
        UNION ALL SELECT first_name,last_name FROM mfp.profiles WHERE id=${context.userId} AND btrim(first_name)<>'' AND btrim(last_name)<>'' LIMIT 1`;
      const name = [names[0]?.["first_name"], names[0]?.["last_name"]]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!name)
        throw new Error(
          "Add your first and last name in your account settings before issuing your certificate.",
        );
      await db.sql`INSERT INTO course_certificates(user_id,course_id,student_name,course_title)
        SELECT ${context.userId},id,${name},title FROM mfp.courses WHERE id=${data.courseId}
        ON CONFLICT(user_id,course_id) DO NOTHING`;
    }
    const rows =
      await db.sql`SELECT id,student_name,course_title,issued_at FROM course_certificates WHERE user_id=${context.userId} AND course_id=${data.courseId}`;
    const c = rows[0];
    return {
      ...progress,
      certificate:
        c && progress.eligible
          ? {
              id: String(c["id"]),
              studentName: String(c["student_name"]),
              courseTitle: String(c["course_title"]),
              issuedAt: String(c["issued_at"]),
            }
          : null,
    };
  });
