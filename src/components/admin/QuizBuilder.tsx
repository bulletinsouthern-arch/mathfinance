import { assessmentVisibility } from "@/lib/assessment.functions";
import { AiPublisher } from "./AiPublisher";
import { getQuizQuestions, saveQuizQuestions, getQuestionDraft } from "@/lib/authoring.functions";
import type { EditedQuestion } from "@/lib/content-schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Course = { id: string; code: string; title: string; subject_id: string };
type Quiz = {
  id: string;
  course_id: string;
  title: string;
  pass_percent: number;
  sort_order: number;
  kind: string;
  time_limit_minutes: number;
};
type Question = {
  id: string;
  quiz_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  sort_order: number;
  qtype: string;
  answer_key: string;
};

export function QuizBuilder() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const { data: courses = [] } = useQuery({
    queryKey: ["admin-all-courses"],
    queryFn: async () =>
      ((await supabase.from("courses").select("id, code, title, subject_id").order("sort_order"))
        .data ?? []) as Course[],
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" />
          Quizzes
        </h3>
        <div>
          <Label>Course</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={courseId ?? ""}
            onChange={(e) => {
              setCourseId(e.target.value || null);
              setQuizId(null);
            }}
          >
            <option value="">Choose a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code}: ` : ""}
                {c.title}
              </option>
            ))}
          </select>
        </div>
        {courseId && <QuizList courseId={courseId} selected={quizId} onSelect={setQuizId} />}
      </section>
      {quizId && <QuestionEditor key={quizId} quizId={quizId} />}
    </div>
  );
}

function QuizList({
  courseId,
  selected,
  onSelect,
}: {
  courseId: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: quizzes = [] } = useQuery({
    queryKey: ["admin-quizzes", courseId],
    queryFn: async () =>
      ((await supabase.from("quizzes").select("*").eq("course_id", courseId).order("sort_order"))
        .data ?? []) as Quiz[],
  });
  const { data: visibility = {} } = useQuery({queryKey:["assessment-visibility"],queryFn:()=>assessmentVisibility({data:{}})});
  const [toggling, setToggling] = useState<string|null>(null);
  async function toggle(id:string) {
    setToggling(id);
    try {
      await assessmentVisibility({data:{quizId:id,enabled:visibility[id] === false}});
      await qc.invalidateQueries({queryKey:["assessment-visibility"]});
      toast.success("Assessment visibility saved");
    } catch { toast.error("Could not change visibility. Retry."); }
    finally {setToggling(null);}
  }
  const [title, setTitle] = useState("");
  const [pass, setPass] = useState("70");
  const [kind, setKind] = useState("quiz");
  const [mins, setMins] = useState("0");

  async function add() {
    if (!title.trim()) return void toast.error("Name the quiz");
    const { error } = await supabase.from("quizzes").insert({
      course_id: courseId,
      title: title.trim(),
      pass_percent: Math.min(100, Math.max(1, Number(pass) || 70)),
      kind,
      time_limit_minutes: Math.max(0, Number(mins) || 0),
      sort_order: quizzes.length,
    });
    if (error) return void toast.error(error.message);
    toast.success("Quiz added");
    setTitle("");
    qc.invalidateQueries({ queryKey: ["admin-quizzes", courseId] });
  }
  async function update(id: string, patch: Partial<Quiz>) {
    const { error } = await supabase.from("quizzes").update(patch).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["admin-quizzes", courseId] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this quiz and its questions?")) return;
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-quizzes", courseId] });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {quizzes.map((q) => (
          <div
            key={q.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${q.id === selected ? "border-primary bg-accent" : "border-border"}`}
          >
            <div className="min-w-0 flex-1">
              <Input
                key={q.title}
                aria-label="Name"
                title="Click to rename"
                className="h-8 text-sm font-medium"
                defaultValue={q.title}
                onFocus={() => onSelect(q.id)}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t && t !== q.title) void update(q.id, { title: t });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <button
                onClick={() => onSelect(q.id)}
                className="mt-0.5 block text-left text-xs text-muted-foreground hover:text-primary"
              >
                {q.kind === "exam" ? "EXAM" : "Quiz"} · Pass {q.pass_percent}% ·{" "}
                {q.time_limit_minutes ? `${q.time_limit_minutes} min` : "no time limit"} · edit
                questions →
              </button>
            </div>
            <Button size="sm" variant={visibility[q.id] === false ? "outline" : "default"} disabled={toggling !== null} onClick={()=>void toggle(q.id)} aria-label={`Toggle ${q.title}`} aria-pressed={visibility[q.id] !== false}>
              {toggling === q.id ? "Saving…" : visibility[q.id] === false ? "Off" : "On"}
            </Button>
            <select
              aria-label="Type"
              className="h-8 rounded-md border border-input bg-background px-1 text-xs"
              value={q.kind}
              onChange={(e) => update(q.id, { kind: e.target.value })}
            >
              <option value="quiz">Quiz</option>
              <option value="exam">Exam</option>
            </select>
            <Input
              aria-label="Pass %"
              title="Pass %"
              className="h-8 w-16 text-xs"
              type="number"
              min="1"
              max="100"
              defaultValue={q.pass_percent}
              onBlur={(e) =>
                Number(e.target.value) !== q.pass_percent &&
                update(q.id, {
                  pass_percent: Math.min(100, Math.max(1, Number(e.target.value) || 70)),
                })
              }
            />
            <Input
              aria-label="Minutes"
              title="Time limit (minutes, 0 = none)"
              className="h-8 w-16 text-xs"
              type="number"
              min="0"
              defaultValue={q.time_limit_minutes}
              onBlur={(e) =>
                Number(e.target.value) !== q.time_limit_minutes &&
                update(q.id, { time_limit_minutes: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(q.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {quizzes.length === 0 && (
          <p className="text-xs text-muted-foreground">No quizzes for this course yet.</p>
        )}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div>
          <Label>Quiz or exam title</Label>
          <Input
            className="mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Unit 1 Assessment"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Type</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="quiz">Quiz</option>
              <option value="exam">Exam</option>
            </select>
          </div>
          <div>
            <Label>Time limit (minutes, 0 = none)</Label>
            <Input
              className="mt-1"
              type="number"
              min="0"
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              placeholder="e.g. 90 for 1.5 hours"
            />
          </div>
        </div>
        <div>
          <Label>Pass mark (%)</Label>
          <Input
            className="mt-1"
            type="number"
            min="1"
            max="100"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </div>
        <Button onClick={add}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add quiz
        </Button>
      </div>
    </div>
  );
}

export function QuestionEditor({ quizId }: { quizId: string }) {
  const qc = useQueryClient();
  const { data: questions = [] } = useQuery({
    queryKey: ["admin-questions", quizId],
    queryFn: async () => (await getQuizQuestions({ data: { quizId, admin: true } })) as Question[],
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Question[] | null>(null);
  const displayed = draft ?? questions;
  const [question, setQuestion] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [d, setD] = useState("");
  const [correct, setCorrect] = useState("a");
  const [qtype, setQtype] = useState("mcq");
  const [key, setKey] = useState("");

  async function add() {
    if (!question.trim()) return void toast.error("Write the question");
    if (qtype === "mcq" && ![a, b, c, d].every((v) => v.trim()))
      return void toast.error("All four options are required");
    if (qtype === "open" && !key.trim())
      return void toast.error("Write the model answer so the AI can check it");
    setBusy(true);
    try {
      const row = {
        id: editing || crypto.randomUUID(),
        quiz_id: quizId,
        question: question.trim(),
        option_a: a.trim(),
        option_b: b.trim(),
        option_c: c.trim(),
        option_d: d.trim(),
        correct_option: correct,
        sort_order: displayed.length,
        qtype,
        answer_key: key.trim(),
      };
      const next = editing
        ? displayed.map((q) => (q.id === editing ? row : q))
        : [...displayed, row];
      await saveQuizQuestions({
        data: { quizId, questions: next as EditedQuestion[], publish: !draft },
      });
      if (draft) setDraft(next);
      setEditing(null);
    } catch {
      toast.error(
        "Could not save. Multiple choice requires four options; open questions require a model answer.",
      );
      return;
    } finally {
      setBusy(false);
    }
    toast.success("Question added");
    setQuestion("");
    setA("");
    setB("");
    setC("");
    setD("");
    setCorrect("a");
    setKey("");
    qc.invalidateQueries({ queryKey: ["admin-questions", quizId] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this question?")) return;
    try {
      const next = displayed.filter((q) => q.id !== id);
      await saveQuizQuestions({
        data: { quizId, questions: next as EditedQuestion[], publish: !draft },
      });
      if (draft) setDraft(next);
    } catch {
      return void toast.error("Could not delete question");
    }
    qc.invalidateQueries({ queryKey: ["admin-questions", quizId] });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <AiPublisher key={quizId} kind="questions" quizId={quizId} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const d = await getQuestionDraft({ data: { quizId } });
              setDraft(d ?? questions);
              toast.success("Editable draft opened");
            } catch {
              toast.error("Could not load draft");
            }
          }}
        >
          Open editable draft
        </Button>
        {draft && (
          <>
            <Button
              onClick={async () => {
                try {
                  await saveQuizQuestions({
                    data: { quizId, questions: draft as EditedQuestion[], publish: true },
                  });
                  setDraft(null);
                  await qc.invalidateQueries();
                  toast.success("Draft published");
                } catch {
                  toast.error("Could not publish draft");
                }
              }}
            >
              Publish draft
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              View published
            </Button>
          </>
        )}
      </div>
      <h3 className="text-xl font-semibold">
        {draft ? "Draft" : "Published"} questions ({displayed.length})
      </h3>
      <div className="space-y-2">
        {displayed.map((q, i) => (
          <div
            key={q.id}
            className="flex items-start gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {i + 1}. {q.question}
              </p>
              {q.qtype === "open" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  <b>Open-ended</b> · Model answer: {q.answer_key}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A. {q.option_a} · B. {q.option_b}
                    {q.option_c ? ` · C. ${q.option_c}` : ""}
                    {q.option_d ? ` · D. ${q.option_d}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    Correct answer: {q.correct_option.toUpperCase()}
                  </p>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(q.id);
                setQuestion(q.question);
                setQtype(q.qtype);
                setA(q.option_a);
                setB(q.option_b);
                setC(q.option_c);
                setD(q.option_d);
                setCorrect(q.correct_option);
                setKey(q.answer_key);
              }}
            >
              Edit
            </Button>
            <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(q.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div>
          <Label>Question type</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={qtype}
            onChange={(e) => setQtype(e.target.value)}
          >
            <option value="mcq">Multiple choice (A–D)</option>
            <option value="open">Open-ended (AI checks the answer)</option>
          </select>
        </div>
        <div>
          <Label>Question</Label>
          <Input className="mt-1" value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>
        {qtype === "open" ? (
          <div>
            <Label>Model answer / key details</Label>
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="The AI accepts different wording if these key points are correct."
            />
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Option A</Label>
                <Input className="mt-1" value={a} onChange={(e) => setA(e.target.value)} />
              </div>
              <div>
                <Label>Option B</Label>
                <Input className="mt-1" value={b} onChange={(e) => setB(e.target.value)} />
              </div>
              <div>
                <Label>Option C</Label>
                <Input className="mt-1" value={c} onChange={(e) => setC(e.target.value)} />
              </div>
              <div>
                <Label>Option D</Label>
                <Input className="mt-1" value={d} onChange={(e) => setD(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Correct answer</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={correct}
                onChange={(e) => setCorrect(e.target.value)}
              >
                <option value="a">A</option>
                <option value="b">B</option>
                <option value="c">C</option>
                <option value="d">D</option>
              </select>
            </div>
          </>
        )}
        <Button disabled={busy} onClick={add}>
          <Plus className="mr-1.5 h-4 w-4" />
          {editing ? "Save question changes" : "Add question"}
          {draft ? " to draft" : " and publish"}
        </Button>
      </div>
    </section>
  );
}
