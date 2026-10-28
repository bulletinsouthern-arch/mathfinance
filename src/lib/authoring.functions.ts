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
      : questions.map(
          ({
            correct_option: _,
            answer_key: __,
            explanation: ___,
            option_explanations: ____,
            ...q
          }) => q,
        );
  });
export const saveQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        quizId: z.string().uuid(),
        questions: z.array(questionSchema).max(2000),
        publish: z.boolean().default(true),
        append: z.boolean().default(false),
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
    const { readQuestions } = await import("./question-data.server");
    const currentQuestions = data.append ? await readQuestions(context.supabase, data.quizId) : [];
    const questions = [...currentQuestions, ...data.questions].map((q, i) => ({
      ...q,
      quiz_id: data.quizId,
      sort_order: i,
    }));
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
        prepareOnly: z.boolean().default(false),
        offset: z.number().int().min(0).max(1999).default(0),
        total: z.number().int().min(1).max(2000).optional(),
        previousQuestions: z.array(z.string().max(8000)).max(2000).default([]),
      })
      .parse(d),
  )
  .handler(prepareAdminContent);

export async function prepareAdminContent({ data, context }: { data: any; context: any }) {
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
        : 'Return ONLY JSON {"questions":[{"question":"text","qtype":"mcq or open","option_a":"choice","option_b":"choice","option_c":"choice","option_d":"choice","correct_option":"a or b or c or d","answer_key":"model answer for open questions","explanation":"why the correct answer is right, with reasoning or working","option_explanations":{"a":"why choice a is right or wrong","b":"why choice b is right or wrong","c":"why choice c is right or wrong","d":"why choice d is right or wrong"}}]}. Keep explanations concise (one or two sentences each). Every mcq must have four nonempty choices and one correct letter. Every open question must have a nonempty model answer. Follow the requested mix. Generate exactly ' +
          data.count +
          " questions.";
    const languageInstruction =
      " Understand commands in Tagalog, Filipino, English, mixed languages, or any language the model supports. Write content in the requested language; otherwise match the user's language. Use the supplied description as source material. Never claim access to unavailable files, websites, or private data. JSON property names and qtype values must stay in English. ";
    const batchInstruction =
      data.kind === "questions"
        ? ` This is questions ${data.offset + 1}–${data.offset + data.count} of ${data.total ?? data.count} in the complete request. The count for THIS response is exactly ${data.count}. Apply requested question-type ranges across the complete set using these positions. Avoid these previous questions: ${JSON.stringify(data.previousQuestions.slice(-60))}. Set answer_key to an empty string for MCQ. Use lowercase a/b/c/d for correct_option. For open questions omit all choice fields.`
        : "";
    let result = await runChat(
      [{ role: "user", content: data.prompt }],
      instruction + languageInstruction + batchInstruction,
      {
        json: true,
        timeoutMs: data.prepareOnly ? 40000 : 16000,
        settingsClient: context.supabase,
      },
    );
    if (!result.ok) return { error: result.error };
    let output: any;
    let prepared: import("./content-schema").EditedQuestion[] = [];
    for (let attempt = 0; attempt < (data.singleAttempt ? 1 : 3); attempt++) {
      try {
        output = parseJson(result.reply);
        if (data.kind === "questions") {
          prepared = z
            .array(z.unknown())
            .length(data.count)
            .parse(output.questions)
            .map((q: any, i) => {
              const type = String(q?.qtype ?? "").toLowerCase();
              const normalized = {
                ...q,
                qtype: type,
                answer_key: q?.answer_key ?? "",
                correct_option: String(q?.correct_option ?? "a")
                  .trim()
                  .toLowerCase(),
                ...(type === "open"
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
                sort_order: data.offset + i,
              };
              const parsed = questionSchema.parse(normalized);
              if (
                data.singleAttempt &&
                (!parsed.explanation.trim() ||
                  (parsed.qtype === "mcq" &&
                    !["a", "b", "c", "d"].every((letter) =>
                      parsed.option_explanations[letter as "a" | "b" | "c" | "d"]?.trim(),
                    )))
              )
                throw new z.ZodError([
                  {
                    code: "custom",
                    path: ["explanation"],
                    message:
                      "Explain the correct answer and why each of the four choices is right or wrong.",
                  },
                ]);
              if (
                parsed.qtype === "mcq" &&
                ![parsed.option_a, parsed.option_b, parsed.option_c, parsed.option_d].every((v) =>
                  v.trim(),
                )
              )
                throw new z.ZodError([
                  {
                    code: "custom",
                    path: ["questions", i],
                    message: "Provide four nonempty choices for every MCQ.",
                  },
                ]);
              return parsed;
            });
          const titles = [...data.previousQuestions, ...prepared.map((q) => q.question)].map((q) =>
            q.trim().toLocaleLowerCase(),
          );
          if (new Set(titles).size !== titles.length)
            throw new z.ZodError([
              {
                code: "custom",
                path: ["questions"],
                message: "Generate distinct questions without repeating previous questions.",
              },
            ]);
        } else formulaPostSchema.parse(output);
        break;
      } catch (validationError) {
        if (attempt === (data.singleAttempt ? 0 : 2)) throw validationError;
        const detail =
          validationError instanceof z.ZodError
            ? validationError.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .slice(0, 8)
                .join("; ")
            : validationError instanceof SyntaxError
              ? "Return complete valid JSON with no surrounding prose."
              : "Provide distinct questions and all four MCQ choices.";
        result = await runChat(
          [
            { role: "user", content: data.prompt },
            {
              role: "user",
              content: `Regenerate this batch. Previous output failed validation: ${detail}`,
            },
          ],
          instruction + languageInstruction + batchInstruction,
          {
            json: true,
            timeoutMs: data.prepareOnly ? 40000 : 16000,
            settingsClient: context.supabase,
          },
        );
        if (!result.ok) return { error: result.error };
      }
    }
    if (data.kind === "questions" && data.prepareOnly) return { questions: prepared };
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.kind === "formula") {
      const f = formulaPostSchema.parse(output);
      const id = crypto.randomUUID();
      await db.sql`INSERT INTO formula_posts (id,category,name,expression,description) VALUES (${id},${f.category},${f.name},${f.expression},${f.description})`;
      return { message: "Formula published. Open it below to edit." };
    }
    if (!data.quizId) throw new Error("Choose a quiz or exam first");
    const generated = prepared;
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
        error: data.singleAttempt
          ? "AI returned an incomplete question or explanation. Retrying this question preserves saved progress."
          : "AI could not produce valid content after three attempts. Nothing was published. Check the requested question types and source description, then retry.",
      };
    return {
      error:
        "Could not save the generated content. Retry when the connection is restored. If this continues, check the database deployment.",
    };
  }
}
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
