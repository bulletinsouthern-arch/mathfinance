import { useState } from "react";
import { MfpMessage } from "./MfpMessage";
import { parsePracticeQuestions } from "@/lib/practice-questions";
import type { QuizFormat } from "@/lib/mfp-study";
import { Button } from "./ui/button";

export function MfpPracticeQuiz({
  content,
  format,
  disabled,
  onSubmit,
}: {
  content: string;
  format?: QuizFormat | undefined;
  disabled: boolean;
  onSubmit: (answers: string) => Promise<void>;
}) {
  const questions = parsePracticeQuestions(content);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  if (
    !questions.length ||
    (format === "multiple-choice" && questions.some((q) => q.options.length !== 4))
  )
    return <MfpMessage content={content} />;
  const locked = disabled || submitted;
  return (
    <form
      aria-label="Practice quiz answers"
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (locked || questions.some((q) => !answers[q.number]?.trim())) return;
        setSubmitted(true);
        try {
          await onSubmit(
            questions.map((q) => `${q.number}: ${answers[q.number]!.trim()}`).join("\n"),
          );
        } catch {
          setSubmitted(false);
        }
      }}
    >
      {questions.map((q) => (
        <fieldset
          key={q.number}
          disabled={locked}
          className="space-y-3 border-b border-border pb-4"
        >
          <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
            Question {q.number} of {q.total}
          </legend>
          <MfpMessage content={q.text} />
          {format === "multiple-choice" || (!format && q.options.length === 4) ? (
            <div role="group" aria-label={`Question ${q.number} choices`} className="grid gap-2">
              {q.options.map((o) => (
                <button
                  key={o.letter}
                  type="button"
                  aria-pressed={answers[q.number] === o.letter}
                  onClick={() => setAnswers((v) => ({ ...v, [q.number]: o.letter }))}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-default ${answers[q.number] === o.letter ? "border-primary bg-accent ring-1 ring-primary" : "border-border bg-background hover:border-primary"}`}
                >
                  <span className="font-bold text-primary">{o.letter}</span>
                  <span>{o.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <label
                htmlFor={`practice-answer-${q.number}`}
                className="mb-1 block text-xs font-semibold"
              >
                Your answer to question {q.number}
              </label>
              <textarea
                id={`practice-answer-${q.number}`}
                required
                maxLength={Math.floor(3500 / questions.length)}
                rows={3}
                value={answers[q.number] ?? ""}
                onChange={(e) => setAnswers((v) => ({ ...v, [q.number]: e.target.value }))}
                placeholder="Type your answer here…"
                className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
        </fieldset>
      ))}
      <Button type="submit" disabled={locked || questions.some((q) => !answers[q.number]?.trim())}>
        {submitted ? "Answers submitted" : "Submit answers"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {submitted
          ? "MFP checks your answers below."
          : "Answer each question, then submit for feedback. This is informal practice."}
      </p>
    </form>
  );
}
