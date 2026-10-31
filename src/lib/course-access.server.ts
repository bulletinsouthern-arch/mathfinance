import { getDatabase } from "@netlify/database";
export async function readCourseAccess(
  context: { userId: string; supabase: any },
  courseId: string,
) {
  const { data: course, error } = await context.supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();
  if (error || !course) throw new Error("Course unavailable");
  // The separate payment store may be unreachable (e.g. preview); fall back to course price only.
  let db: ReturnType<typeof getDatabase> | null = null;
  let plans: any[] = [];
  try {
    db = getDatabase();
    plans = await db.sql`SELECT monthly,yearly FROM course_payment_plans WHERE course_id=${courseId}`;
  } catch (e) {
    console.error("[course-access] payment store unavailable", e);
    db = null;
  }
  const monthly = Number(plans[0]?.["monthly"] ?? 0),
    yearly = Number(plans[0]?.["yearly"] ?? 0);
  const paid =
    Number(course.price) > 0 || course.paid_plan_required === true || monthly > 0 || yearly > 0;
  const { data: admin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  const grants = !db ? [] :
    await db.sql`SELECT expires_at FROM course_paid_access WHERE user_id=${context.userId} AND course_id=${courseId} AND (expires_at IS NULL OR expires_at>now())`;
  return {
    allowed: !!admin || !paid || grants.length > 0,
    paid,
    monthly,
    yearly,
    expiresAt: grants[0]?.["expires_at"] ? String(grants[0]["expires_at"]) : null,
  };
}
export async function assertQuizCourseAccess(
  context: { userId: string; supabase: any },
  quizId: string,
) {
  const { data: q, error } = await context.supabase
    .from("quizzes")
    .select("course_id")
    .eq("id", quizId)
    .maybeSingle();
  if (error || !q) throw new Error("Assessment unavailable");
  if (!(await readCourseAccess(context, q.course_id)).allowed)
    throw new Error("Payment required to enter this course.");
}
