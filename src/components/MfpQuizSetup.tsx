import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { StudyContext } from "@/lib/mfp-bus";
import type { QuizDifficulty, QuizFormat, QuizSettings, QuizTopic } from "@/lib/mfp-study";

type CourseRow = { id: string; code: string; title: string; description: string; course_units?: { title: string; sort_order: number }[] | null };

const pill = (on: boolean) => `rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`;

// Quiz Me setup: learners pick size, topic (any available course), difficulty
// and question format before the AI writes its own practice quiz.
export function MfpQuizSetup({ context, onStart, onCancel }: { context?: StudyContext | undefined; onStart: (s: QuizSettings) => void; onCancel: () => void }) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("Medium");
  const [format, setFormat] = useState<QuizFormat>("multiple-choice");
  const [topic, setTopic] = useState(context ? "lesson" : "");
  const [info, setInfo] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data } = await supabase.from("courses").select("id, code, title, description, course_units(title, sort_order)").order("sort_order");
        if (!live) return;
        const rows = (data ?? []) as CourseRow[];
        setCourses(rows);
        setTopic((t) => t || rows[0]?.id || "general");
      } catch {
        if (live) setTopic((t) => t || "general");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  function start() {
    const course = courses.find((c) => c.id === topic);
    const chosen: QuizTopic | undefined = course
      ? { code: course.code, title: course.title, description: course.description, units: [...(course.course_units ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((u) => u.title) }
      : undefined;
    onStart({ count, difficulty, format, ...(topic === "lesson" && context ? { context } : chosen ? { topic: chosen } : {}) });
  }

  return (
    <section aria-label="Practice quiz setup" className="space-y-4">
      <h2 className="text-lg font-bold text-primary">Practice Quiz</h2>
      {info && (
        <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-3 pr-8 text-sm">
          <p className="font-bold text-primary">How quizzes work</p>
          <p className="mt-1 text-foreground/80">Pick how many questions you want, what topic to cover, how challenging the questions should be, and whether you want choices or open-ended answers. MFP writes a fresh quiz from your course material every time, asks one question at a time, and tells you at the end whether you are ready.</p>
          <button type="button" aria-label="Hide quiz help" onClick={() => setInfo(false)} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <fieldset>
        <legend className="mb-2 text-sm text-muted-foreground">Number of questions</legend>
        <div className="grid grid-cols-4 gap-2">
          {[3, 5, 7, 10].map((n) => <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={pill(count === n)}>{n}</button>)}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2 block text-sm text-muted-foreground">Topic</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={loading && !context} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring">
          {loading && !context && <option value="">Loading courses…</option>}
          {context && <option value="lesson">This lesson: {context.lesson.slice(0, 80)}</option>}
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code}: ` : ""}{c.title}</option>)}
          {!loading && <option value="general">General business, finance and math</option>}
        </select>
      </label>
      <fieldset>
        <legend className="mb-2 text-sm text-muted-foreground">Difficulty</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["Easy", "Medium", "Hard"] as const).map((d) => <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)} className={pill(difficulty === d)}>{d}</button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm text-muted-foreground">Question type</legend>
        <div className="grid grid-cols-2 gap-2">
          {([["multiple-choice", "Multiple choice"], ["open-ended", "Open-ended"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={format === v} onClick={() => setFormat(v)} className={pill(format === v)}>{l}</button>)}
        </div>
      </fieldset>
      <button type="button" disabled={!topic} onClick={start} className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">Start Quiz</button>
      <button type="button" onClick={onCancel} className="w-full py-1 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
    </section>
  );
}
