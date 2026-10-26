import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, List, Pause, Play, Square, Volume2, X } from "lucide-react";
import { RichContent, speakableText } from "@/components/RichContent";
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
type Quiz = { id: string; course_id: string; unit_id: string | null; section_id: string | null; title: string; pass_percent: number; sort_order: number };

function CoursePage() {
  const { subjectId, courseId } = Route.useParams();
  const { s: sectionId, q: quizId, paid } = Route.useSearch();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAdmin } = useAuth();

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

  const ordered = useMemo(() => units.flatMap((u) => sections.filter((x) => x.unit_id === u.id)), [units, sections]);
  // Open on the first page of unit 1 unless a page was chosen.
  const activeSection = useMemo(() => sections.find((x) => x.id === sectionId) ?? ordered[0], [sections, sectionId, ordered]);
  const activeQuiz = useMemo(() => quizzes.find((x) => x.id === quizId), [quizzes, quizId]);

  useEffect(() => {
    if (activeSection) setOpenUnits((o) => ({ ...o, [activeSection.unit_id]: true }));
  }, [activeSection]);

  const [paying, setPaying] = useState(false);
  const canRead = !!enrollment || isAdmin;

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
    <div>
      {/* Mobile: small course-index tab on the left edge (like Saylor) */}
      <button onClick={() => setMenuOpen(true)} aria-label="Open course index"
        className="fixed left-0 top-1/2 z-30 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card text-primary shadow lg:hidden">
        <List className="h-4 w-4" />
      </button>
      {menuOpen && <div className="fixed inset-0 z-40 bg-foreground/40 lg:hidden" onClick={() => setMenuOpen(false)} />}
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className={`${menuOpen ? "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-xs" : "hidden"} flex-col border-r border-border bg-card lg:sticky lg:top-20 lg:z-auto lg:flex lg:max-h-[calc(100vh-6rem)] lg:w-auto lg:max-w-none lg:self-start lg:rounded-2xl lg:border`}>
        <div className="relative border-b border-border p-4 pr-12">
          <button onClick={() => setMenuOpen(false)} aria-label="Close course index" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-border lg:hidden"><X className="h-4 w-4" /></button>
          <p className="text-xs font-semibold tracking-[0.15em] text-primary">COURSE BOOK</p>
          <p className="mt-1 font-medium leading-snug">{course.code ? `${course.code}: ` : ""}{course.title}</p>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
          <p className="rounded-md bg-accent px-2 py-2 text-sm font-semibold">Course Introduction</p>
          {!canRead && <p className="ml-4 px-2 py-1.5 text-[13px] text-muted-foreground">Enroll me in this course</p>}
          {canRead && units.map((u, i) => {
            const open = openUnits[u.id] ?? true;
            const unitSections = sections.filter((x) => x.unit_id === u.id);
            const unitQuizzes = quizzes.filter((x) => x.unit_id === u.id && !x.section_id);
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
                      <Link key={sec.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: sec.id, q: undefined, paid: undefined }}
                        className={`block truncate rounded-md px-2 py-1.5 text-[13px] ${sec.id === activeSection?.id && !activeQuiz ? "bg-primary font-medium text-primary-foreground" : "text-foreground/80 hover:bg-accent"}`}>
                        {sec.title}
                      </Link>
                    )).flatMap((el, j) => [el, ...quizzes.filter((qz) => qz.section_id === unitSections[j]!.id).map((qz) => (
                      <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id, paid: undefined }}
                        className={`ml-3 flex items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-[13px] ${qz.id === activeQuiz?.id ? "bg-primary font-medium text-primary-foreground" : "text-foreground/80 hover:bg-accent"}`}>
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />{qz.title}
                      </Link>
                    ))])}
                    {unitQuizzes.map((qz) => (
                      <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id, paid: undefined }}
                        className={`flex items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-[13px] ${qz.id === activeQuiz?.id ? "bg-primary font-medium text-primary-foreground" : "text-foreground/80 hover:bg-accent"}`}>
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />{qz.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {canRead && quizzes.filter((x) => !x.unit_id && !x.section_id).map((qz) => (
            <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id, paid: undefined }}
              className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${qz.id === activeQuiz?.id ? "bg-primary font-medium text-primary-foreground" : "hover:bg-accent"}`}>
              <ClipboardList className="h-4 w-4 shrink-0 text-gold" />{qz.title}
            </Link>
          ))}
          {units.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">Course content is on the way.</p>}
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <header className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <p className="text-xs font-semibold tracking-[0.15em] text-primary">
            <Link to="/courses" className="hover:underline">COURSES</Link> / <Link to="/courses/$subjectId" params={{ subjectId }} className="hover:underline">SUBJECT</Link>
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">{course.code ? `${course.code}: ` : ""}{course.title}</h1>
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

        {!canRead ? (
          <section className="rounded-xl border border-border bg-card p-5 text-center sm:p-8">
            <h2 className="text-xl font-bold sm:text-2xl">Course Introduction</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{course.description || "Enroll to unlock the course book, lessons and quizzes."}</p>
            {session ? (
              <Button onClick={enroll} disabled={paying} className="mt-5">{paying ? "Opening payment…" : course.price > 0 ? `Enroll Me in This Course — ₱${course.price}` : "Enroll Me in This Course"}</Button>
            ) : (
              <Button asChild className="mt-5"><Link to="/auth" search={{ mode: "login" }}>Sign in to enroll</Link></Button>
            )}
            <p className="mt-2 text-xs italic text-muted-foreground">{course.price > 0 ? "You will pay on the next page" : "Free · Self-paced"}</p>
          </section>
        ) : activeQuiz ? (
          <QuizView quiz={activeQuiz} courseId={courseId} />
        ) : activeSection ? (
          (() => {
            const idx = ordered.findIndex((x) => x.id === activeSection.id);
            const prev = ordered[idx - 1];
            const next = ordered[idx + 1];
            const unit = units.find((u) => u.id === activeSection.unit_id);
            const go = (id: string) => ({ to: "/courses/$subjectId/$courseId" as const, params: { subjectId, courseId }, search: { s: id, q: undefined, paid: undefined } });
            return (
              <article className="rounded-xl border border-border bg-card">
                <div className="flex border-b border-border px-4 sm:px-6"><span className="border-b-2 border-primary py-3 text-sm font-bold">Book</span></div>
                <div className="p-4 sm:p-6">
                  <button onClick={() => unit && setOpenUnits((o) => ({ ...o, [unit.id]: true }))} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    <ArrowUp className="h-4 w-4" />Back to '{unit?.title ?? "Unit"}'
                  </button>
                  <div className="mt-3 rounded-lg bg-muted/60 p-4">
                    <span className="rounded-full bg-background px-3 py-1 text-xs"><b>To do:</b> View</span>
                  </div>
                  <div className="mt-5 flex items-center justify-end gap-2">
                    <ListenButton key={activeSection.id} text={`${activeSection.title}. ${speakableText(activeSection.content)}`} />
                    {prev && <Link {...go(prev.id)} aria-label="Previous page" className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-primary hover:bg-accent"><ArrowLeft className="h-5 w-5" /></Link>}
                    {next && <Link {...go(next.id)} aria-label="Next page" className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-primary hover:bg-accent"><ArrowRight className="h-5 w-5" /></Link>}
                  </div>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">{activeSection.title}</p>
                  <div className="mt-4 rounded-xl border border-border bg-background p-4 shadow-sm sm:p-6 md:p-10">
                    {activeSection.content ? <RichContent text={activeSection.content} /> : <p className="text-sm text-muted-foreground">This section has no content yet.</p>}
                  </div>
                  {quizzes.filter((qz) => qz.section_id === activeSection.id).map((qz) => (
                    <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id, paid: undefined }}
                      className="mt-6 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-accent/60 px-5 py-4 font-bold text-primary hover:bg-accent">
                      <ClipboardList className="h-5 w-5" />Take the quiz: {qz.title}<ArrowRight className="ml-auto h-4 w-4" />
                    </Link>
                  ))}
                  <div className="mt-8 flex justify-between border-t border-border pt-4">
                    {prev ? <Link {...go(prev.id)} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ChevronLeft className="h-4 w-4" />{prev.title}</Link> : <span />}
                    {next && <Link {...go(next.id)} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{next.title}<ChevronRight className="h-4 w-4" /></Link>}
                  </div>
                </div>
              </article>
            );
          })()
        ) : (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">Pick a section from the course book to start reading.</div>
        )}
      </div>
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

function ListenButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);
  function play() {
    const synth = window.speechSynthesis;
    if (!synth) return void toast.error("Your browser does not support reading aloud.");
    if (state === "paused") { synth.resume(); setState("playing"); return; }
    synth.cancel();
    const parts = (text.match(/[^.!?\n]+[.!?]?/g) ?? [text]).map((p) => p.trim()).filter(Boolean);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.rate = 1;
      u.lang = "en-US";
      if (i === parts.length - 1) u.onend = () => setState("idle");
      synth.speak(u);
    });
    setState("playing");
  }
  function pause() { window.speechSynthesis.pause(); setState("paused"); }
  function stop() { window.speechSynthesis.cancel(); setState("idle"); }
  return (
    <div className="mr-auto flex items-center gap-1.5">
      {state === "playing" ? (
        <button onClick={pause} className="flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"><Pause className="h-4 w-4" />Pause</button>
      ) : (
        <button onClick={play} className="flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">{state === "paused" ? <Play className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{state === "paused" ? "Resume" : "Listen"}</button>
      )}
      {state !== "idle" && <button onClick={stop} aria-label="Stop" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-primary"><Square className="h-4 w-4" /></button>}
    </div>
  );
}
