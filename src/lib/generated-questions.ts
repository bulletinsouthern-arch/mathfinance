import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
const generatedQuestion = z.discriminatedUnion("qtype", [
  z.object({ qtype: z.literal("mcq"), question: text, a: text, b: text, c: text, d: text, correct: z.enum(["a", "b", "c", "d"]) }),
  z.object({ qtype: z.literal("open"), question: text, answer: text }),
]);
export const generatedQuestions = z.object({ questions: z.array(generatedQuestion).min(1).max(100) });
