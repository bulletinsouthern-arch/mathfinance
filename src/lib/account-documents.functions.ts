import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const accountDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    const [receipts, certificates] = await Promise.all([
      db.sql`SELECT c.id,c.course_id,c.plan,c.amount_centavos,c.provider_id,c.paid_at,a.expires_at,q.title,q.subject_id
      FROM course_checkouts c JOIN mfp.courses q ON q.id=c.course_id
      LEFT JOIN course_paid_access a ON a.user_id=c.user_id AND a.course_id=c.course_id
      WHERE c.user_id=${context.userId} AND c.paid_at IS NOT NULL ORDER BY c.paid_at DESC LIMIT 100`,
      db.sql`SELECT id,course_id,course_title,issued_at FROM course_certificates WHERE user_id=${context.userId} ORDER BY issued_at DESC LIMIT 100`,
    ]);
    return {
      receipts: receipts.map((r) => ({
        id: String(r["id"]),
        courseId: String(r["course_id"]),
        subjectId: String(r["subject_id"]),
        title: String(r["title"]),
        plan: String(r["plan"]),
        amountCentavos: Number(r["amount_centavos"]),
        reference: String(r["provider_id"]),
        paidAt: String(r["paid_at"]),
        expiresAt: r["expires_at"] ? String(r["expires_at"]) : null,
      })),
      certificates: certificates.map((c) => ({
        id: String(c["id"]),
        courseId: String(c["course_id"]),
        courseTitle: String(c["course_title"]),
        issuedAt: String(c["issued_at"]),
      })),
    };
  });
