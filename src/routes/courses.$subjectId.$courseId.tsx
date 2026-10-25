import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { gradeQuiz, type QuizQuestion } from "@/lib/quiz";
import { createCourseCheckout } from "@/lib/paymongo.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/courses/$subjectId/$courseId")({
  validateSearch: (s: Record<string, unknown>) => ({
    s: typeof s["s"] === "string" ? (s["s"] as string) : undefined,
    q: typeof s["q"] === "string" ? (s["q"] as string) : undefined,
    paid: typeof s["paid"] === "string" ? (s["paid"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Course — Math & Finance Pro" },
      { name: "description", content: "Read the course book, enroll and take the quiz." },
      { property: "og:title", content: "Course — Math & Finance Pro" },
      { property: "og:description", content: "Read the course book, enroll and take the quiz." },
    ],
  }),
  component: CoursePage,
});

type Unit = { id: string; course_id: string; title: string; sort_order: number };
type Section = { id: string; unit_id: string; title: string; content: string; sort_order: number };
type Quiz = { id: string; course_id: string; unit_id: string | null; title: string; pass_percent: number; sort_order: number };

function CoursePage() {
  const { subjectId, courseId } = Route.useParams();
  const { s: sectionId, q: quizId, paid } = Route.useSearch();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, description, price").eq("id", courseId).maybeSingle()).data,
  });
  const { data: units = [] } = useQuery({
    queryKey: ["units", courseId],
    queryFn: async () => ((await supabase.from("course_units").select("*").eq("course_id", courseId).order("sort_order")).data ?? []) as Unit[],
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections", courseId],
    queryFn: async () => {
      const { data: us } = await supabase.from("course_units").select("id").eq("course_id", courseId);
      const ids = (us ?? []).map((u) => u.id);
      if (!ids.length) return [] as Section[];
      return ((await supabase.from("course_sections").select("*").in("unit_id", ids).order("sort_order")).data ?? []) as Section[];
    },
  });
  const { data: quizzes = [] } = useQuery({
    queryKey: ["quizzes", courseId],
    queryFn: async () => ((await supabase.from("quizzes").select("*").eq("course_id", courseId).order("sort_order")).data ?? []) as Quiz[],
  });
  const { data: enrollment } = useQuery({
    queryKey: ["enrollment", courseId, session?.user.id],
    enabled: !!session,
    queryFn: async () => (await supabase.from("enrollments").select("id").eq("course_id", courseId).eq("user_id", session!.user.id).maybeSingle()).data,
  });

  // Remember the visit for "Recently accessed" on the dashboard.
  useEffect(() => {
    if (!session) return;
    void supabase.from("course_views").upsert({ user_id: session.user.id, course_id: courseId, viewed_at: new Date().toISOString() });
  }, [session, courseId]);

  const activeSection = useMemo(() => sections.find((x) => x.id === sectionId) ?? sections[0], [sections, sectionId]);
  const activeQuiz = useMemo(() => quizzes.find((x) => x.id === quizId), [quizzes, quizId]);

  useEffect(() => {
    if (activeSection) setOpenUnits((o) => ({ ...o, [activeSection.unit_id]: true }));
  }, [activeSection]);

  const [paying, setPaying] = useState(false);

  async function enroll() {
    if (!session) return;
    if (course!.price > 0) {
      setPaying(true);
      const res = await createCourseCheckout({ data: { courseId } });
      setPaying(false);
      if (!res.ok) return void toast.error(res.error);
      window.location.href = res.checkout_url;
      return;
    }
    const { error } = await supabase.from("enrollments").insert({ user_id: session.user.id, course_id: courseId });
    if (error) return void toast.error(error.message);
    toast.success("You are enrolled — happy learning!");
    qc.invalidateQueries({ queryKey: ["enrollment", courseId] });
  }

  if (!course) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="h-fit rounded-2xl border border-border bg-card lg:sticky lg:top-24">
        <div className="border-b border-border p-4">
          <p className="text-xs font-semibold tracking-[0.15em] text-primary">COURSE BOOK</p>
          <p className="mt-1 font-medium leading-snug">{course.code ? `${course.code}: ` : ""}{course.title}</p>
        </div>
        <nav className="max-h-[60vh] space-y-1 overflow-y-auto p-3">
          {units.map((u, i) => {
            const open = openUnits[u.id] ?? false;
            const unitSections = sections.filter((x) => x.unit_id === u.id);
            const unitQuizzes = quizzes.filter((x) => x.unit_id === u.id);
            return (
              <div key={u.id}>
                <button onClick={() => setOpenUnits((o) => ({ ...o, [u.id]: !open }))}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-accent">
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-primary" />}
                  <span className="truncate">{i + 1}. {u.title}</span>
                </button>
                {open && (
                  <div className="ml-6 space-y-0.5 border-l border-border pl-2">
                    {unitSections.map((sec) => (
                      <Link key={sec.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: sec.id, q: undefined }}
                        className={`block truncate rounded-md px-2 py-1.5 text-[13px] ${sec.id === activeSection?.id && !activeQuiz ? "bg-primary font-medium text-primary-foreground" : "text-foreground/80 hover:bg-accent"}`}>
                        {sec.title}
                      </Link>
                    ))}
                    {unitQuizzes.map((qz) => (
                      <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id }}
                        className={`flex items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-[13px] ${qz.id === activeQuiz?.id ? "bg-primary font-medium text-primary-foreground" : "text-foreground/80 hover:bg-accent"}`}>
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />{qz.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {quizzes.filter((x) => !x.unit_id).map((qz) => (
            <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id }}
              className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${qz.id === activeQuiz?.id ? "bg-primary font-medium text-primary-foreground" : "hover:bg-accent"}`}>
              <ClipboardList className="h-4 w-4 shrink-0 text-gold" />{qz.title}
            </Link>
          ))}
          {units.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">Course content is on the way.</p>}
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <header className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-semibold tracking-[0.15em] text-primary">
            <Link to="/courses" className="hover:underline">COURSES</Link> / <Link to="/courses/$subjectId" params={{ subjectId }} className="hover:underline">SUBJECT</Link>
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">{course.code ? `${course.code}: ` : ""}{course.title}</h1>
          {course.description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{course.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {enrollment ? (
              <span className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />Enrolled
              </span>
            ) : session ? (
              <Button onClick={enroll} disabled={paying}><GraduationCap className="mr-1.5 h-4 w-4" />{paying ? "Opening payment…" : `Enroll ${course.price > 0 ? `— ₱${course.price}` : "— Free"}`}</Button>
            ) : (
              <Button asChild><Link to="/auth" search={{ mode: "login" }}>Sign in to enroll</Link></Button>
            )}
            <span className="text-xs text-muted-foreground">Self-paced · No certificate</span>
          </div>
          {paid === "1" && !enrollment && (
            <p className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground">
              Payment received — your enrollment is being confirmed and will appear here shortly.
            </p>
          )}
        </header>

        {activeQuiz ? (
          <QuizView quiz={activeQuiz} courseId={courseId} />
        ) : activeSection ? (
          <article className="rounded-2xl border border-border bg-card p-6 lg:p-8">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.15em] text-primary"><BookOpen className="h-4 w-4" />SECTION</p>
            <h2 className="mt-2 text-2xl font-semibold">{activeSection.title}</h2>
            <span className="mt-3 block h-0.5 w-14 bg-gold" />
            <div className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">{activeSection.content || "This section has no content yet."}</div>
          </article>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">Pick a section from the course book to start reading.</div>
        )}
      </div>
    </div>
  );
}

function QuizView({ quiz, courseId }: { quiz: Quiz; courseId: string }) {
  const { session } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<ReturnType<typeof gradeQuiz> | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: questions = [] } = useQuery({
    queryKey: ["quiz-questions", quiz.id],
    enabled: !!session,
    queryFn: async () => ((await supabase.from("quiz_questions").select("*").eq("quiz_id", quiz.id).order("sort_order")).data ?? []) as QuizQuestion[],
  });

  if (!session)
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">Sign in to take this quiz.</p>
        <Button asChild className="mt-4"><Link to="/auth" search={{ mode: "login" }}>Sign in</Link></Button>
      </div>
    );

  async function finish() {
    if (!questions.length) return;
    const r = gradeQuiz(questions, answers, quiz.pass_percent);
    setGraded(r);
    setBusy(true);
    const { error } = await supabase.from("quiz_attempts").insert({ user_id: session!.user.id, quiz_id: quiz.id, score: r.score, total: r.total, passed: r.passed });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(r.passed ? `Passed — ${r.percent}%` : `Scored ${r.percent}%`);
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6 lg:p-8">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.15em] text-primary"><ClipboardList className="h-4 w-4" />QUIZ</p>
        <h2 className="mt-2 text-2xl font-semibold">{quiz.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Pass mark: {quiz.pass_percent}% · Answers turn green when correct and red when wrong.</p>
      </div>

      {questions.length === 0 && <p className="text-sm text-muted-foreground">This quiz has no questions yet.</p>}

      {questions.map((q, i) => {
        const chosen = answers[q.id];
        const opts: [string, string][] = [["a", q.option_a], ["b", q.option_b], ["c", q.option_c], ["d", q.option_d]];
        return (
          <div key={q.id} className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium">{i + 1}. {q.question}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {opts.filter(([, t]) => t).map(([letter, text]) => {
                const isChosen = chosen === letter;
                const state = !isChosen ? "" : letter === q.correct_option
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-destructive bg-destructive/10 text-destructive";
                return (
                  <button key={letter} disabled={!!graded} onClick={() => setAnswers((a) => ({ ...a, [q.id]: letter }))}
                    className={`rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:border-primary ${state}`}>
                    <span className="mr-2 font-semibold uppercase">{letter}.</span>{text}
                  </button>
                );
              })}
            </div>
            {graded && (
              <p className={`mt-2 text-xs font-medium ${graded.results[q.id] ? "text-primary" : "text-destructive"}`}>
                {graded.results[q.id] ? "Correct" : `Wrong — the correct answer is ${q.correct_option.toUpperCase()}`}
              </p>
            )}
          </div>
        );
      })}

      {graded ? (
        <div className={`rounded-xl p-6 text-center ${graded.passed ? "bg-accent" : "bg-destructive/10"}`}>
          <p className="font-serif text-4xl font-semibold">{graded.score}/{graded.total}</p>
          <p className="mt-1 text-sm font-medium">{graded.percent}% — {graded.passed ? "Passed" : "Not passed yet"}</p>
          <Button variant="outline" className="mt-4" onClick={() => { setGraded(null); setAnswers({}); }}>Try again</Button>
        </div>
      ) : (
        questions.length > 0 && (
          <Button onClick={finish} disabled={busy || Object.keys(answers).length < questions.length}>
            {busy ? "Saving…" : Object.keys(answers).length < questions.length ? `Answer all ${questions.length} questions` : "Finish quiz & see my score"}
          </Button>
        )
      )}
    </section>
  );
}
