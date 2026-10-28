import type { EditedQuestion } from "./content-schema";
export async function readQuestions(sb: any, quizId: string): Promise<EditedQuestion[]> {
  const { getDatabase } = await import("@netlify/database");
  const rows = await getDatabase()
    .sql`SELECT questions FROM quiz_question_edits WHERE quiz_id=${quizId}`;
  if (rows.length) return rows[0]!["questions"] as EditedQuestion[];
  const { data, error } = await sb
    .from("quiz_questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("sort_order");
  if (error) throw new Error("Could not load questions");
  return data ?? [];
}
