export type QuizQuestion = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
};

export type GradeResult = {
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  results: Record<string, boolean>;
};

// Pure grading: compares chosen letters to the admin-set correct letter.
export function gradeQuiz(
  questions: QuizQuestion[],
  answers: Record<string, string>,
  passPercent: number,
): GradeResult {
  const results: Record<string, boolean> = {};
  let score = 0;
  for (const q of questions) {
    const ok = answers[q.id] === q.correct_option;
    results[q.id] = ok;
    if (ok) score += 1;
  }
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);
  return { score, total, percent, passed: percent >= passPercent, results };
}
