import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { StudyContext } from "@/lib/mfp-bus";
import { textbookSample, type QuizDifficulty, type QuizFormat, type QuizSettings, type QuizTopic, type SectionRow } from "@/lib/mfp-study";

type CourseRow = { id: string; code: string; title: string; description: string; course_units?: { id: string; title: string; sort_order: number }[] | null };

const pill = (on: boolean) => `rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`;

// Quiz Me setup: learners pick size, topic (any available course), difficulty
// and question format before the AI writes its own practice quiz.
export function MfpQuizSetup({ context, onStart, onCancel }: { context?: StudyContext | undefined; onStart: (s: QuizSettings) => void; onCancel: () => void }) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("Medium");
  const [format, setFormat] = useState<QuizFormat>("multiple-choice");
  const [topic, setTopic] = useState("");
  const [info, setInfo] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data } = await supabase.from("courses").select("id, code, title, description, course_units(id, title, sort_order)").order("sort_order");
        if (!live) return;
        const rows = (data ?? []) as CourseRow[];
        setCourses(rows);
        setTopic((t) => t || rows.find((c) => context && ((c.code && context.course.includes(c.code)) || context.course.includes(c.title)))?.id || rows[0]?.id || "");
      } catch {
        /* the course list stays empty */
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const [preparing, setPreparing] = useState(false);
  const selected = courses.find((c) => c.id === topic);
  const sortedUnits = (c: CourseRow) => [...(c.course_units ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setSections([]); setPageIds([]); setError("");
    if (!selected) { setPreparing(false); return; }
    setPreparing(true);
    const units = sortedUnits(selected);
    (async () => {
      try {
        const { data, error: loadError } = await supabase.from("course_sections").select("id, unit_id, title, content, sort_order").in("unit_id", units.map((u) => u.id));
        if (loadError) throw loadError;
        if (live) setSections(units.flatMap((u) => ((data ?? []) as SectionRow[]).filter((p) => p.unit_id === u.id).sort((a, b) => a.sort_order - b.sort_order)));
      } catch {
        if (live) setError("Course pages could not be loaded. Reopen Quiz Me to retry.");
      } finally { if (live) setPreparing(false); }
    })();
    return () => { live = false; };
  }, [selected]);

  function start() {
    if (!Number.isInteger(count) || count < 1 || count > 20) return;
    if (topic === "lesson" && context) {
      onStart({ count, difficulty, format, context });
      return;
    }
    if (!selected) return;
    const pages = pageIds.length ? sections.filter((p) => p.id && pageIds.includes(p.id)) : sections;
    const textbook = textbookSample(sortedUnits(selected), pages);
    if (!textbook) { setError("No textbook text is available for these pages. Choose other pages or ask your teacher to add course content."); return; }
    const chosen: QuizTopic = { code: selected.code, title: selected.title, description: selected.description, units: sortedUnits(selected).map((u) => u.title), textbook };
    onStart({ count, difficulty, format, topic: chosen });
  }

  return (
    <section aria-label="Practice quiz setup" className="space-y-4">
      <h2 className="text-lg font-bold text-primary">Practice Quiz</h2>
      {info && (
        <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-3 pr-8 text-sm">
          <p className="font-bold text-primary">How quizzes work</p>
          <p className="mt-1 text-foreground/80">Pick how many questions you want, what topic to cover, how challenging the questions should be, and whether you want choices or open-ended answers. MFP shows your chosen questions together, then checks your numbered answers with brief feedback.</p>
          <button type="button" aria-label="Hide quiz help" onClick={() => setInfo(false)} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <fieldset>
        <legend className="mb-2 text-sm text-muted-foreground">Number of questions</legend>
        <div className="grid grid-cols-4 gap-2">
          {[3, 5, 7, 10].map((n) => <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={pill(count === n)}>{n}</button>)}
        </div>
        <label className="mt-2 block text-sm text-muted-foreground">Custom number (1–20)
          <input type="number" min={1} max={20} step={1} value={Number.isNaN(count) ? "" : count} onChange={(e) => setCount(e.target.valueAsNumber)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground" />
        </label>
      </fieldset>
      <label className="block">
        <span className="mb-2 block text-sm text-muted-foreground">Topic</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={loading && !context} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring">
          {loading && !context && <option value="">Loading courses…</option>}
          {context && <option value="lesson">{context.course} — {context.lesson.slice(0, 80)} (this page only)</option>}
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code}: ` : ""}{c.title}</option>)}
          {!loading && !context && courses.length === 0 && <option value="">No courses available yet</option>}
        </select>
      </label>
      {selected && <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Pages in {selected.code || selected.title} (optional)</legend>
        <p className="mb-2 text-xs text-muted-foreground">All course pages are included by default. Select pages below to limit the quiz. Page numbers follow the course lesson order.</p>
        <div className="max-h-40 space-y-2 overflow-y-auto">
          {sections.map((page, index) => <label key={page.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={!!page.id && pageIds.includes(page.id)} onChange={(e) => { const id = page.id; setError(""); if (id) setPageIds((prev) => e.target.checked ? [...prev, id] : prev.filter((p) => p !== id)); }} className="mt-1" />
            <span>Page {index + 1}: {page.title}</span>
          </label>)}
        </div>
        <p className="mt-2 text-xs font-semibold">{pageIds.length ? `${pageIds.length} selected pages` : "Entire course"}</p>
      </fieldset>}
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
      <p role="note" className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-foreground/80">
        <span className="font-bold text-foreground">What to expect: </span>
        {format === "multiple-choice"
          ? "Each question has four options, A to D. Send numbered answers, for example 1: B, 2: A."
          : "Each question asks you to define, explain or apply a concept. Type your answer in your own words; MFP grades the meaning and shows a model answer."}
        {" "}Questions cover important concepts from {topic === "lesson" && context ? `${context.course}: ${context.lesson}` : selected ? `${selected.code || selected.title}${pageIds.length ? " selected pages" : " across the entire course"}` : "your course textbook"}. Send answers with their question numbers.

      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" disabled={!topic || preparing || !!error || !Number.isInteger(count) || count < 1 || count > 20} onClick={() => void start()} className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{preparing ? "Loading course textbook…" : "Start Quiz"}</button>
      <button type="button" onClick={onCancel} className="w-full py-1 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
    </section>
  );
}
