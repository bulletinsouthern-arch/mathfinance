import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const studentName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    const rows = await db.sql`SELECT first_name, last_name FROM mfp.student_names WHERE user_id = ${context.userId}::uuid`;
    if (rows[0]) return `${rows[0]["first_name"]} ${rows[0]["last_name"]}`;
    const { data, error } = await context.supabase.auth.getUser();
    if (error) throw new Error("Could not load your profile.");
    const parsed = z.object({ first_name: z.string().trim().min(1).max(100), last_name: z.string().trim().min(1).max(100) }).safeParse(data.user?.user_metadata);
    if (!parsed.success) return null;
    const { first_name, last_name } = parsed.data;
    await db.sql`INSERT INTO mfp.student_names (user_id, first_name, last_name) VALUES (${context.userId}::uuid, ${first_name}, ${last_name}) ON CONFLICT (user_id) DO NOTHING`;
    await db.sql`UPDATE mfp.profiles SET first_name = ${first_name}, last_name = ${last_name} WHERE id = ${context.userId}::uuid`;
    return `${first_name} ${last_name}`;
  });

export const examDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quizId: z.string().uuid(), answers: z.record(z.string().uuid(), z.string().max(8000)).optional(), clear: z.boolean().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.clear) {
      await db.sql`DELETE FROM mfp.exam_drafts WHERE user_id = ${context.userId}::uuid AND quiz_id = ${data.quizId}::uuid`;
      return {} as Record<string, string>;
    }
    if (data.answers) {
      if (Object.keys(data.answers).length > 500) throw new Error("Too many answers.");
      await db.sql`INSERT INTO mfp.exam_drafts (user_id, quiz_id, answers) VALUES (${context.userId}::uuid, ${data.quizId}::uuid, ${JSON.stringify(data.answers)}::jsonb) ON CONFLICT (user_id, quiz_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = now()`;
      return data.answers;
    }
    const rows = await db.sql`SELECT answers FROM mfp.exam_drafts WHERE user_id = ${context.userId}::uuid AND quiz_id = ${data.quizId}::uuid`;
    return (rows[0]?.["answers"] ?? {}) as Record<string, string>;
  });

export const updateStudentName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ first_name: z.string().trim().min(1).max(100), last_name: z.string().trim().min(1).max(100) }).parse(d))
  .handler(async ({ context, data }) => {
    const { getDatabase } = await import("@netlify/database");
    await getDatabase().sql`INSERT INTO mfp.student_names (user_id, first_name, last_name) VALUES (${context.userId}::uuid, ${data.first_name}, ${data.last_name}) ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = now()`;
    await getDatabase().sql`UPDATE mfp.profiles SET first_name = ${data.first_name}, last_name = ${data.last_name} WHERE id = ${context.userId}::uuid`;
    return { ok: true };
  });
