import { getDatabase } from "@netlify/database";

export async function completionProgress(userId: string, courseId: string) {
  const db = getDatabase();
  // Legacy quiz_attempts accepted browser-written pass flags, so only server-graded
  // assessment sessions are authoritative for issuing credentials.
  const rows = await db.sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE
    EXISTS (SELECT 1 FROM assessment_sessions s WHERE s.user_id=${userId} AND s.quiz_id=q.id
      AND s.result->>'passed'='true' AND s.review_status<>'suspended'
      AND (s.review_status='dismissed' OR (s.warning_count=0 AND s.visual_flagged_at IS NULL))
      AND NOT EXISTS (SELECT 1 FROM exam_live_rooms r WHERE r.session_id=s.id AND (r.suspended_at IS NOT NULL OR r.removed_at IS NOT NULL)))
    )::int AS passed FROM mfp.quizzes q WHERE q.course_id=${courseId}`;
  const total = Number(rows[0]?.["total"] ?? 0),
    passed = Number(rows[0]?.["passed"] ?? 0);
  return { total, passed, eligible: total > 0 && total === passed };
}

export async function verifiedCertificate(id: string) {
  const db = getDatabase();
  const rows =
    await db.sql`SELECT id,user_id,course_id,student_name,course_title,issued_at FROM course_certificates WHERE id=${id}`;
  const c = rows[0];
  if (!c || !(await completionProgress(String(c["user_id"]), String(c["course_id"]))).eligible)
    return null;
  return {
    id: String(c["id"]),
    studentName: String(c["student_name"]),
    courseTitle: String(c["course_title"]),
    issuedAt: String(c["issued_at"]),
  };
}
