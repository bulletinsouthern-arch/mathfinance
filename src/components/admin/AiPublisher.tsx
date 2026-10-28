import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { generateAdminContent } from "@/lib/authoring.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function AiPublisher({ kind, quizId }: { kind: "formula" | "questions"; quizId?: string }) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(50);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function publish() {
    setBusy(true);
    try {
      const r = await generateAdminContent({
        data: { kind, quizId, prompt, count: kind === "formula" ? 1 : count },
      });
      toast.success(r.message);
      await qc.invalidateQueries();
    } catch {
      toast.error("Could not publish. Check your AI settings and request, then retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
      <h3 className="font-semibold">Admin Ollama publisher</h3>
      <p className="text-xs text-muted-foreground">
        Your command publishes immediately. Published content stays editable below. Public assistant
        chats cannot publish.
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
      <Button
        disabled={busy || !prompt.trim() || !Number.isInteger(count) || count < 1 || count > 50}
        onClick={publish}
      >
        {busy ? "Generating and publishing…" : "Command Ollama · Publish now"}
      </Button>
    </section>
  );
}
