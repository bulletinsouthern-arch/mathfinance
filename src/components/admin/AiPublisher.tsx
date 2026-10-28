import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { generateAdminContent, saveQuizQuestions } from "@/lib/authoring.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function AiPublisher({ kind, quizId }: { kind: "formula" | "questions"; quizId?: string }) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(50);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function publish() {
    setBusy(true);
    setError("");
    try {
      if (kind === "questions" && quizId) {
        const questions: import("@/lib/content-schema").EditedQuestion[] = [];
        setProgress(0);
        while (questions.length < count) {
          const r = await generateAdminContent({
            data: {
              kind,
              quizId,
              prompt,
              count: Math.min(5, count - questions.length),
              prepareOnly: true,
              offset: questions.length,
              total: count,
              previousQuestions: questions.map((q) => q.question),
            },
          });
          if (r.error || !r.questions) {
            const message = r.error || "AI returned no questions. Nothing was published.";
            setError(message);
            toast.error(message);
            return;
          }
          questions.push(...r.questions);
          setProgress(questions.length);
        }
        await saveQuizQuestions({ data: { quizId, questions, publish: true, append: true } });
        toast.success(`${questions.length} questions published with an editable draft.`);
      } else {
        const r = await generateAdminContent({ data: { kind, quizId, prompt, count: 1 } });
        if (r.error) {
          setError(r.error);
          toast.error(r.error);
          return;
        }
        toast.success(r.message);
      }
      await qc.invalidateQueries();
    } catch {
      const message =
        "Publishing could not complete. Check your connection and sign-in status, then retry. Your command is still here.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
      <h3 className="font-semibold">Admin Ollama publisher</h3>
      <p className="text-xs text-muted-foreground">
        Your command publishes immediately. Published content stays editable below. Public assistant
        chats cannot publish. Commands can use Tagalog, English, or another language supported by
        your configured model. This publisher creates formulas or questions from your supplied
        description; it cannot run unrelated site commands.
      </p>
      <Textarea
        aria-label="Admin AI command"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          kind === "formula"
            ? "Post the quadratic formula in category 24."
            : "Create questions about this description: … Use 30 multiple-choice and 20 open-ended questions with model answers."
        }
      />
      {kind === "questions" && (
        <label className="block text-sm">
          Number of questions (1–50 per command)
          <input
            aria-label="Number of AI questions"
            className="ml-2 w-20 rounded border bg-background p-2"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        disabled={
          busy ||
          (kind === "questions" && !quizId) ||
          !prompt.trim() ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 50
        }
        onClick={publish}
      >
        {busy
          ? kind === "questions"
            ? `Preparing ${progress}/${count} questions…`
            : "Generating and publishing…"
          : "Command Ollama · Publish now"}
      </Button>
    </section>
  );
}
