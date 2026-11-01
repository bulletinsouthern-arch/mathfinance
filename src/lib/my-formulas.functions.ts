import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateEquation, equationVars } from "./equation";

// Private student formulas: every query is scoped to the verified account, so
// other students can never load, change or delete someone else's formulas.
const MAX_FORMULAS = 200;
const expression = z.string().trim().min(1).max(500).refine((src) => {
  try {
    evaluateEquation(src, Object.fromEntries(equationVars(src).map((k) => [k, 1])));
    return true;
  } catch { return false; }
}, "Formula cannot be calculated");
export const myFormulaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  expression,
  description: z.string().max(2000).default(""),
  outputLabel: z.string().trim().max(60).default("Result"),
  outputUnit: z.enum(["", "₱", "%"]).default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#1c6658"),
  inputs: z.record(z.string().max(60), z.string().max(40)).default({}),
  scenarios: z.array(z.object({ name: z.string().trim().min(1).max(40), change: z.number().min(-100).max(1000) })).max(8).default([]),
});
export type MyFormula = z.infer<typeof myFormulaSchema>;

export const myFormulas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.discriminatedUnion("action", [
    z.object({ action: z.literal("load") }),
    z.object({ action: z.literal("save"), formula: myFormulaSchema }),
    z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  ]).parse(input))
  .handler(async ({ data, context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.action === "save") {
      const f = data.formula;
      const rows = await db.sql`INSERT INTO student_formulas(user_id,id,name,expression,description,output_label,output_unit,color,inputs,scenarios)
        SELECT ${context.userId},${f.id},${f.name},${f.expression},${f.description},${f.outputLabel},${f.outputUnit},${f.color},${JSON.stringify(f.inputs)}::jsonb,${JSON.stringify(f.scenarios)}::jsonb
        WHERE (SELECT count(*) FROM student_formulas WHERE user_id=${context.userId}) < ${MAX_FORMULAS}
          OR EXISTS (SELECT 1 FROM student_formulas WHERE user_id=${context.userId} AND id=${f.id})
        ON CONFLICT(user_id,id) DO UPDATE SET name=EXCLUDED.name,expression=EXCLUDED.expression,description=EXCLUDED.description,
          output_label=EXCLUDED.output_label,output_unit=EXCLUDED.output_unit,color=EXCLUDED.color,inputs=EXCLUDED.inputs,
          scenarios=EXCLUDED.scenarios,updated_at=now()
        RETURNING id`;
      if (!rows.length) throw new Error(`You can save up to ${MAX_FORMULAS} formulas. Delete one to add another.`);
      return [];
    }
    if (data.action === "delete") {
      await db.sql`DELETE FROM student_formulas WHERE user_id=${context.userId} AND id=${data.id}`;
      return [];
    }
    const rows = await db.sql`SELECT id,name,expression,description,output_label,output_unit,color,inputs,scenarios
      FROM student_formulas WHERE user_id=${context.userId} ORDER BY updated_at DESC LIMIT ${MAX_FORMULAS}`;
    return rows.flatMap((r) => {
      const parsed = myFormulaSchema.safeParse({
        id: r["id"], name: r["name"], expression: r["expression"], description: r["description"],
        outputLabel: r["output_label"], outputUnit: r["output_unit"], color: r["color"],
        inputs: r["inputs"], scenarios: r["scenarios"],
      });
      return parsed.success ? [parsed.data] : [];
    });
  });

const checkResult = z.object({
  verdict: z.enum(["correct", "check", "wrong"]),
  feedback: z.string(),
  suggestion: z.string().default(""),
});

/** Asks the AI (Ollama, through the shared runChat) whether a student's formula is right. */
export const checkMyFormula = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().max(100),
    expression: z.string().trim().min(1).max(500),
    description: z.string().max(2000).default(""),
    outputLabel: z.string().max(60).default(""),
  }).parse(d))
  .handler(async ({ data }) => {
    const { runChat } = await import("./ai.functions");
    const r = await runChat(
      [{ role: "user", content: JSON.stringify(data) }],
      'A student wrote their own formula. Decide if the expression correctly computes what the name, description and output label say (for example "Revenue" should be Price * Units_Sold, not Price + Units_Sold). Check operators, missing or extra terms, wrong order of operations, division that should be multiplication, and percentage handling. Return only JSON {"verdict":"correct"|"check"|"wrong","feedback":"1-3 short plain sentences addressed to the student","suggestion":"corrected expression using the same variable names with + - * / ^ ( ), or empty string if correct"}. Use "check" when the formula is valid but its intent is unclear or it is a non-standard version.',
      { json: true, timeoutMs: 25000 },
    );
    if (!r.ok) throw new Error(r.error);
    const parsed = checkResult.parse(JSON.parse(r.reply.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")));
    if (parsed.suggestion && !expression.safeParse(parsed.suggestion).success) parsed.suggestion = "";
    if (parsed.suggestion.replace(/\s/g, "") === data.expression.replace(/\s/g, "")) parsed.suggestion = "";
    return parsed;
  });
