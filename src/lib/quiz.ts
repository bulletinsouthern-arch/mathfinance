export type QuizQuestion = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  qtype?: string;
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

// Mixed grading: multiple-choice is checked by letter; open-ended answers use
// the AI checker's score (0–1, credit counted when >= 0.5).
export function gradeMixed(
  questions: QuizQuestion[],
  answers: Record<string, string>,
  openScores: Record<string, number>,
  passPercent: number,
): GradeResult {
  const results: Record<string, boolean> = {};
  let score = 0;
  for (const q of questions) {
    const ok = q.qtype === "open" ? (openScores[q.id] ?? 0) >= 0.5 : answers[q.id] === q.correct_option;
    results[q.id] = ok;
    if (ok) score += 1;
  }
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);
  return { score, total, percent, passed: percent >= passPercent, results };
}

// After 2 warnings (leaving fullscreen / switching tab) the exam is auto-submitted.
export const MAX_WARNINGS = 2;
export const shouldAutoSubmit = (warnings: number) => warnings > MAX_WARNINGS;
