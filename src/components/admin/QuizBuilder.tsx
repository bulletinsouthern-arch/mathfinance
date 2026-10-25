import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Course = { id: string; code: string; title: string; subject_id: string };
type Quiz = { id: string; course_id: string; title: string; pass_percent: number; sort_order: number };
type Question = { id: string; quiz_id: string; question: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: string; sort_order: number };

export function QuizBuilder() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const { data: courses = [] } = useQuery({
    queryKey: ["admin-all-courses"],
    queryFn: async () => ((await supabase.from("courses").select("id, code, title, subject_id").order("sort_order")).data ?? []) as Course[],
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h3 className="flex items-center gap-2 text-xl font-semibold"><ClipboardList className="h-5 w-5 text-primary" />Quizzes</h3>
        <div>
          <Label>Course</Label>
          <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={courseId ?? ""} onChange={(e) => { setCourseId(e.target.value || null); setQuizId(null); }}>
            <option value="">Choose a course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code}: ` : ""}{c.title}</option>)}
          </select>
        </div>
        {courseId && <QuizList courseId={courseId} selected={quizId} onSelect={setQuizId} />}
      </section>
      {quizId && <QuestionEditor quizId={quizId} />}
    </div>
  );
}

function QuizList({ courseId, selected, onSelect }: { courseId: string; selected: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: quizzes = [] } = useQuery({
    queryKey: ["admin-quizzes", courseId],
    queryFn: async () => ((await supabase.from("quizzes").select("*").eq("course_id", courseId).order("sort_order")).data ?? []) as Quiz[],
  });
  const [title, setTitle] = useState("");
  const [pass, setPass] = useState("70");

  async function add() {
    if (!title.trim()) return void toast.error("Name the quiz");
    const { error } = await supabase.from("quizzes").insert({ course_id: courseId, title: title.trim(), pass_percent: Number(pass) || 70, sort_order: quizzes.length });
    if (error) return void toast.error(error.message);
    toast.success("Quiz added");
    setTitle("");
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
          <div key={q.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${q.id === selected ? "border-primary bg-accent" : "border-border"}`}>
            <button onClick={() => onSelect(q.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{q.title}</span>
              <span className="block text-xs text-muted-foreground">Pass mark {q.pass_percent}%</span>
            </button>
            <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(q.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {quizzes.length === 0 && <p className="text-xs text-muted-foreground">No quizzes for this course yet.</p>}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div><Label>Quiz title</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unit 1 Assessment" /></div>
        <div><Label>Pass mark (%)</Label><Input className="mt-1" type="number" min="1" max="100" value={pass} onChange={(e) => setPass(e.target.value)} /></div>
        <Button onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add quiz</Button>
      </div>
    </div>
  );
}

export function QuestionEditor({ quizId }: { quizId: string }) {
  const qc = useQueryClient();
  const { data: questions = [] } = useQuery({
    queryKey: ["admin-questions", quizId],
    queryFn: async () => ((await supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("sort_order")).data ?? []) as Question[],
  });
  const [question, setQuestion] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [d, setD] = useState("");
  const [correct, setCorrect] = useState("a");

  async function add() {
    if (!question.trim() || !a.trim() || !b.trim()) return void toast.error("Question and at least options A and B are required");
    const { error } = await supabase.from("quiz_questions").insert({
      quiz_id: quizId, question: question.trim(),
      option_a: a.trim(), option_b: b.trim(), option_c: c.trim(), option_d: d.trim(),
      correct_option: correct, sort_order: questions.length,
    });
    if (error) return void toast.error(error.message);
    toast.success("Question added");
    setQuestion(""); setA(""); setB(""); setC(""); setD(""); setCorrect("a");
    qc.invalidateQueries({ queryKey: ["admin-questions", quizId] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this question?")) return;
    const { error } = await supabase.from("quiz_questions").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-questions", quizId] });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h3 className="text-xl font-semibold">Questions ({questions.length})</h3>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{i + 1}. {q.question}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A. {q.option_a} · B. {q.option_b}{q.option_c ? ` · C. ${q.option_c}` : ""}{q.option_d ? ` · D. ${q.option_d}` : ""}
              </p>
              <p className="mt-1 text-xs font-semibold text-primary">Correct answer: {q.correct_option.toUpperCase()}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(q.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div><Label>Question</Label><Input className="mt-1" value={question} onChange={(e) => setQuestion(e.target.value)} /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label>Option A</Label><Input className="mt-1" value={a} onChange={(e) => setA(e.target.value)} /></div>
          <div><Label>Option B</Label><Input className="mt-1" value={b} onChange={(e) => setB(e.target.value)} /></div>
          <div><Label>Option C (optional)</Label><Input className="mt-1" value={c} onChange={(e) => setC(e.target.value)} /></div>
          <div><Label>Option D (optional)</Label><Input className="mt-1" value={d} onChange={(e) => setD(e.target.value)} /></div>
        </div>
        <div>
          <Label>Correct answer</Label>
          <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={correct} onChange={(e) => setCorrect(e.target.value)}>
            <option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option>
          </select>
        </div>
        <Button onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add question</Button>
      </div>
    </section>
  );
}
