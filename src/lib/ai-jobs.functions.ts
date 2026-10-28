import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Small batches reduce provider round trips while preserving saved checkpoints.
// All checkpoints stay server-side; compare-and-swap prevents duplicate retries.
export const aiPublishJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        action: z.enum(["load", "start", "step"]),
        quizId: z.string().uuid(),
        id: z.string().uuid().optional(),
        batchSize: z.number().int().min(1).max(5).default(5),
        prompt: z.string().trim().min(1).max(10000).optional(),
        total: z.number().int().min(1).max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.action === "start") {
      if (!data.id || !data.prompt || !data.total) throw new Error("Missing command");
      await db.sql`INSERT INTO ai_publish_jobs (id,user_id,quiz_id,prompt,total)
        VALUES (${data.id},${context.userId},${data.quizId},${data.prompt},${data.total}) ON CONFLICT(id) DO NOTHING`;
    }
    const rows = data.id
      ? await db.sql`SELECT * FROM ai_publish_jobs WHERE id=${data.id} AND user_id=${context.userId} AND quiz_id=${data.quizId}`
      : await db.sql`SELECT * FROM ai_publish_jobs WHERE user_id=${context.userId} AND quiz_id=${data.quizId} AND NOT published ORDER BY updated_at DESC LIMIT 1`;
    const job = rows[0];
    if (!job) return null;
    const view = () => ({
      id: String(job["id"]),
      prompt: String(job["prompt"]),
      total: Number(job["total"]),
      progress: job["questions"].length as number,
      published: Boolean(job["published"]),
      error: "",
    });
    if (data.action !== "step" || job["published"]) return view();
    if (job["questions"].length < job["total"]) {
      const { prepareAdminContent } = await import("./authoring.functions");
      const generated = await prepareAdminContent({
        context,
        data: {
          kind: "questions",
          quizId: data.quizId,
          prompt: job["prompt"],
          count: Math.min(data.batchSize, job["total"] - job["questions"].length),
          total: job["total"],
          offset: job["questions"].length,
          previousQuestions: job["questions"].map((q: any) => q.question),
          prepareOnly: true,
          singleAttempt: true,
        },
      });
      if (generated.error || !generated.questions)
        return {
          ...view(),
          error: generated.error || "The AI returned no questions. Saved progress is safe.",
        };
      const json = JSON.stringify([...job["questions"], ...generated.questions]);
      const updated =
        await db.sql`UPDATE ai_publish_jobs SET questions=${json}::jsonb,updated_at=now()
        WHERE id=${job["id"]} AND jsonb_array_length(questions)=${job["questions"].length} AND NOT published RETURNING *`;
      if (!updated.length) return view();
      Object.assign(job, updated[0]);
    }
    if (job["questions"].length === job["total"]) {
      const { readQuestions } = await import("./question-data.server");
      // Seed from legacy questions if this quiz has never been edited in Netlify.
      const legacy = JSON.stringify(await readQuestions(context.supabase, data.quizId));
      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [data.quizId]);
        const locked = await client.query(
          "SELECT published FROM ai_publish_jobs WHERE id=$1 FOR UPDATE",
          [job["id"]],
        );
        if (!locked.rows[0].published) {
          await client.query(
            "INSERT INTO quiz_question_edits (quiz_id,questions,draft) VALUES ($1,$2::jsonb,$2::jsonb) ON CONFLICT(quiz_id) DO NOTHING",
            [data.quizId, legacy],
          );
          const current = await client.query(
            "SELECT questions FROM quiz_question_edits WHERE quiz_id=$1 FOR UPDATE",
            [data.quizId],
          );
          const questions = [...current.rows[0].questions, ...job["questions"]].map(
            (q: any, i: number) => ({ ...q, sort_order: i }),
          );
          const json = JSON.stringify(questions);
          await client.query(
            "UPDATE quiz_question_edits SET questions=$2::jsonb,draft=$2::jsonb,updated_at=now() WHERE quiz_id=$1",
            [data.quizId, json],
          );
          await client.query(
            "UPDATE ai_publish_jobs SET published=true,updated_at=now() WHERE id=$1",
            [job["id"]],
          );
        }
        await client.query("COMMIT");
        job["published"] = true;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    return view();
  });
