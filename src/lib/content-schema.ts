import { z } from "zod";
import { equationVars, evaluateEquation } from "./equation";
export const formulaPostSchema = z
  .object({
    id: z.string().uuid().optional(),
    category: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .transform((value) => (/^\d[\d,]*$/.test(value) ? value.replaceAll(",", "") : value)),
    name: z.string().trim().min(1).max(200),
    expression: z.string().trim().min(1).max(2000),
    description: z.string().max(10000).default(""),
    published: z.boolean().default(true),
  })
  .superRefine((f, ctx) => {
    try {
      evaluateEquation(
        f.expression,
        Object.fromEntries(equationVars(f.expression).map((k) => [k, 1])),
      );
    } catch {
      ctx.addIssue({ code: "custom", message: "Use a valid calculator expression" });
    }
  });
export const questionSchema = z
  .object({
    id: z.string().uuid(),
    quiz_id: z.string().uuid(),
    question: z.string().trim().min(1).max(8000),
    option_a: z.string().default(""),
    option_b: z.string().default(""),
    option_c: z.string().default(""),
    option_d: z.string().default(""),
    correct_option: z.enum(["a", "b", "c", "d"]).default("a"),
    qtype: z.enum(["mcq", "open"]),
    answer_key: z.string().default(""),
    explanation: z.string().max(8000).default(""),
    option_explanations: z.record(z.enum(["a", "b", "c", "d"]), z.string().max(4000)).default({}),
    sort_order: z.number().int().min(0),
  })
  .superRefine((q, c) => {
    if (
      q.qtype === "open"
        ? !q.answer_key.trim()
        : !q.option_a.trim() || !q.option_b.trim() || !q[`option_${q.correct_option}`].trim()
    )
      c.addIssue({ code: "custom", message: "Provide four choices or an open-ended model answer" });
  });
export type LibraryPost = z.infer<typeof formulaPostSchema> & { id: string };
export type EditedQuestion = z.infer<typeof questionSchema>;
