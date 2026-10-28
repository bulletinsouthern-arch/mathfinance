import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { generateAdminContent } from "@/lib/authoring.functions";
import { aiPublishJob } from "@/lib/ai-jobs.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function AiPublisher({ kind, quizId }: { kind: "formula" | "questions"; quizId?: string }) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(50);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const job = useRef<{ id: string; prompt: string; total: number } | null>(null);
  const [loading, setLoading] = useState(kind === "questions");
  useEffect(() => {
    let active = true;
    job.current = null;
    if (kind !== "questions" || !quizId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void aiPublishJob({ data: { action: "load", quizId } })
      .then((saved) => {
        if (!active || !saved) return;
        job.current = saved;
        setPrompt(saved.prompt);
        setCount(saved.total);
        setProgress(saved.progress);
      })
      .catch(() => {
        if (active) setError("Could not load saved progress. Retry when the service is available.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, quizId]);
  async function publish() {
    setBusy(true);
    setError("");
    try {
      if (kind === "questions" && quizId) {
        if (!job.current || job.current.prompt !== prompt || job.current.total !== count) {
          job.current = { id: crypto.randomUUID(), prompt, total: count };
          setProgress(0);
        }
        const current = job.current;
        let saved = await aiPublishJob({ data: { action: "start", quizId, ...current } });
        let failures = 0;
        let batchSize = 5;
        while (saved && !saved.published) {
          setProgress(saved.progress);
          try {
            const next = await aiPublishJob({ data: { action: "step", quizId, id: current.id, batchSize } });
            if (!next) throw new Error("Missing saved command");
            if (next.error) {
              batchSize = 1;
              if (/key|model was not found|endpoint/i.test(next.error) || failures >= 2) {
                setError(
                  next.error + " Your prepared questions are saved. Retry resumes this command.",
                );
                return;
              }
              failures++;
            } else {
              saved = next;
              failures = 0;
            }
          } catch {
            batchSize = 1;
            if (++failures >= 3) throw new Error("Paused");
          }
          if (failures) await new Promise((resolve) => setTimeout(resolve, failures * 2000));
        }
        if (!saved) throw new Error("Missing saved command");
        setProgress(saved.progress);
        toast.success(`${saved.total} questions published with an editable draft.`);
        job.current = null;
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
      const message = kind === "questions"
        ? "Publishing paused because the server or AI did not complete the request. Prepared questions are saved; retry resumes without publishing duplicates. If your session expired, sign in again and reopen this quiz."
        : "The AI or server did not finish publishing the formula. Retry, or test the model in AI Settings.";
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
        disabled={busy || loading}
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
          Number of questions (1–2000 per command)
          <input
            disabled={busy || loading}
            aria-label="Number of AI questions"
            className="ml-2 w-20 rounded border bg-background p-2"
            type="number"
            min={1}
            max={2000}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      )}
      {kind === "questions" && (
        <p className="text-xs text-muted-foreground" role="status">
          {progress}/{count} questions prepared. Commands run in saved batches of up to five questions and can
          take several minutes. Keep this page open while preparing. If interrupted, reopen this
          quiz and resume the saved command.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        disabled={
          busy ||
          loading ||
          (kind === "questions" && !quizId) ||
          !prompt.trim() ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 2000
        }
        onClick={publish}
      >
        {busy
          ? kind === "questions"
            ? `Preparing ${progress}/${count} questions…`
            : "Generating and publishing…"
          : progress > 0
            ? "Resume command · Publish when complete"
            : "Command Ollama · Publish now"}
      </Button>
    </section>
  );
}
