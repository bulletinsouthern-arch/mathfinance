import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { questionSchema, formulaPostSchema } from "./content-schema";
function parseJson(text: string) {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, ""),
  );
}
export const interpretEquation = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ text: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const { runChat } = await import("./ai.functions");
    const r = await runChat(
      [{ role: "user", content: data.text }],
      'Read this equation from ANY subject. Return only JSON {"name":"title","expression":"safe arithmetic RHS","description":"plain English explanation"}. Calculator supports variables using ASCII names with underscores, + - * / ^ % (), sqrt abs ln log exp min max round sin cos tan asin acos atan floor ceil. Use pi and e as numeric literals. Rearrange simple assignments to their RHS; for implicit equations, calculus or unsupported notation explain limitations and omit expression (use empty string). Never invent an exact calculator for an unsupported equation.',
    );
    if (!r.ok) throw new Error(r.error);
    const parsed = z
      .object({ name: z.string(), expression: z.string(), description: z.string() })
      .parse(parseJson(r.reply));
    if (parsed.expression) formulaPostSchema.parse({ ...parsed, category: "Equation" });
    return parsed;
  });
export const getQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ quizId: z.string().uuid(), admin: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.admin) {
      const { data: admin, error } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (error || !admin) throw new Error("Forbidden");
    }
    const { readQuestions } = await import("./question-data.server");
    const questions = await readQuestions(context.supabase, data.quizId);
    return data.admin
      ? questions
      : questions.map(({ correct_option: _, answer_key: __, ...q }) => q);
  });
export const saveQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        quizId: z.string().uuid(),
        questions: z.array(questionSchema).max(2000),
        publish: z.boolean().default(true),
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
    const questions = data.questions.map((q, i) => ({ ...q, quiz_id: data.quizId, sort_order: i }));
    const json = JSON.stringify(questions);
    if (data.publish)
      await db.sql`INSERT INTO quiz_question_edits (quiz_id,questions,draft) VALUES (${data.quizId},${json}::jsonb,${json}::jsonb) ON CONFLICT(quiz_id) DO UPDATE SET questions=EXCLUDED.questions,draft=EXCLUDED.draft,updated_at=now()`;
    else {
      const { readQuestions } = await import("./question-data.server");
      const current = JSON.stringify(await readQuestions(context.supabase, data.quizId));
      await db.sql`INSERT INTO quiz_question_edits (quiz_id,questions,draft) VALUES (${data.quizId},${current}::jsonb,${json}::jsonb) ON CONFLICT(quiz_id) DO UPDATE SET draft=EXCLUDED.draft,updated_at=now()`;
    }
    return { ok: true };
  });
export const generateAdminContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        prompt: z.string().trim().min(1).max(10000),
        kind: z.enum(["formula", "questions"]),
        count: z.number().int().min(1).max(50).default(1),
        quizId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    if (data.kind === "questions" && !data.quizId)
      return { error: "Choose a quiz or exam before generating questions." };
    try {
      const { runChat } = await import("./ai.functions");
      const instruction =
        data.kind === "formula"
          ? 'Return ONLY JSON {"category":"number or category name","name":"title","expression":"arithmetic expression","description":"explanation"}. Expression must use ASCII variable names, + - * / ^ (), sqrt abs ln log exp sin cos tan. No assignment or LaTex.'
          : 'Return ONLY JSON {"questions":[{"question":"text","qtype":"mcq or open","option_a":"choice","option_b":"choice","option_c":"choice","option_d":"choice","correct_option":"a or b or c or d","answer_key":"model answer for open questions"}]}. Every mcq must have four nonempty choices and one correct letter. Every open question must have a nonempty model answer. Follow the requested mix. Generate exactly ' +
            data.count +
            " questions.";
      const result = await runChat([{ role: "user", content: data.prompt }], instruction, {
        json: true,
        settingsClient: context.supabase,
      });
      if (!result.ok) return { error: result.error };
      const output = parseJson(result.reply);
      const { getDatabase } = await import("@netlify/database");
      const db = getDatabase();
      if (data.kind === "formula") {
        const f = formulaPostSchema.parse(output);
        const id = crypto.randomUUID();
        await db.sql`INSERT INTO formula_posts (id,category,name,expression,description) VALUES (${id},${f.category},${f.name},${f.expression},${f.description})`;
        return { message: "Formula published. Open it below to edit." };
      }
      if (!data.quizId) throw new Error("Choose a quiz or exam first");
      const generated = z
        .array(z.unknown())
        .length(data.count)
        .parse(output.questions)
        .map((q: any, i) =>
          questionSchema.parse({
            ...q,
            ...(q?.qtype === "open"
              ? {
                  option_a: "",
                  option_b: "",
                  option_c: "",
                  option_d: "",
                  correct_option: "a",
                }
              : {}),
            id: crypto.randomUUID(),
            quiz_id: data.quizId,
            sort_order: i,
          }),
        );
      if (
        generated.some(
          (q) =>
            q.qtype === "mcq" &&
            ![q.option_a, q.option_b, q.option_c, q.option_d].every((v) => v.trim()),
        )
      )
        return {
          error:
            "AI omitted multiple-choice options. Nothing was published. Retry and request four choices for every multiple-choice question.",
        };
      const { readQuestions } = await import("./question-data.server");
      const current = await readQuestions(context.supabase, data.quizId);
      const json = JSON.stringify(
        [...current, ...generated].map((q, i) => ({ ...q, sort_order: i })),
      );
      await db.sql`INSERT INTO quiz_question_edits (quiz_id,questions,draft) VALUES (${data.quizId},${json}::jsonb,${json}::jsonb) ON CONFLICT(quiz_id) DO UPDATE SET questions=EXCLUDED.questions,draft=EXCLUDED.draft,updated_at=now()`;
      return { message: generated.length + " questions published with an editable draft." };
    } catch (error) {
      if (error instanceof SyntaxError)
        return {
          error:
            "AI returned incomplete JSON. Nothing was published. Retry with fewer questions or a simpler command.",
        };
      if (error instanceof z.ZodError)
        return {
          error:
            "AI content did not meet the required format or question count. Nothing was published. Retry with a simpler command or fewer questions; formulas must use calculator syntax.",
        };
      return {
        error:
          "Could not save the generated content. Retry when the connection is restored. If this continues, check the database deployment.",
      };
    }
  });
export const getQuestionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quizId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    const { getDatabase } = await import("@netlify/database");
    const rows = await getDatabase()
      .sql`SELECT draft FROM quiz_question_edits WHERE quiz_id=${data.quizId}`;
    return rows.length ? (rows[0]!["draft"] as import("./content-schema").EditedQuestion[]) : null;
  });
