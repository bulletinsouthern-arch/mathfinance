import { courseAccess } from "@/lib/course-plans.functions";
import { getAssessmentVisibility } from "@/lib/assessment.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, List, Sparkles, X } from "lucide-react";
import { RichContent } from "@/components/RichContent";
import { LessonReader } from "@/components/LessonReader";
import { askMfp, MFP_STUDY_CONTEXT, type StudyContextRequest } from "@/lib/mfp-bus";
import { buildTextbookQuestion } from "@/lib/mfp-textbook";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createCourseCheckout, paymentGatewayStatus } from "@/lib/paymongo.functions";
import { listUnitNumbers } from "@/lib/unit-numbers.functions";
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
  const textbookRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (textbookRef.current) textbookRef.current.scrollTop = 0;
  }, [courseId, sectionId, quizId]);
  const { isAdmin } = useAuth();

  const { data: course, isLoading: courseLoading, isError: courseError } = useQuery({
    queryKey: ["course", courseId, subjectId],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, description, price").eq("id", courseId).eq("subject_id", subjectId).maybeSingle()).data,
  });
  const {data:paidAccess,isError:accessError}=useQuery({queryKey:["course-access",courseId,session?.user.id],enabled:!!session,queryFn:()=>courseAccess({data:{courseId}}),refetchInterval:paid==="1"?4000:30000});
  const { data: gateway } = useQuery({queryKey:["payment-gateway-status",session?.user.id],enabled:!!session,queryFn:()=>paymentGatewayStatus(),refetchInterval:30000});
  const gatewayUnavailable = gateway?.available === false;
  const [plan,setPlan]=useState<"once"|"monthly"|"yearly">("once");
  useEffect(()=>{if(paidAccess && !Number(course?.price) && plan==='once') setPlan(paidAccess.monthly>0?'monthly':'yearly');},[paidAccess,course?.price,plan]);
  const { data: unitNumbers, isError: numberError, refetch: retryNumbers } = useQuery({
    queryKey: ["unit-numbers", courseId],
    queryFn: () => listUnitNumbers({ data: { courseId } }),
  });
  const { data: units = [] } = useQuery({
    queryKey: ["units", courseId], enabled: paidAccess?.allowed===true,
    queryFn: async () => ((await supabase.from("course_units").select("*").eq("course_id", courseId).order("sort_order")).data ?? []) as Unit[],
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections", courseId, session?.user.id], enabled: paidAccess?.allowed===true,
    queryFn: async () => {
      const { data: us } = await supabase.from("course_units").select("id").eq("course_id", courseId);
      const ids = (us ?? []).map((u) => u.id);
      if (!ids.length) return [] as Section[];
      return ((await supabase.from("course_sections").select("*").in("unit_id", ids).order("sort_order")).data ?? []) as Section[];
    },
  });
  const { data: visibility } = useQuery({queryKey:["assessment-visibility"], queryFn:()=>getAssessmentVisibility()});
  const { data: allQuizzes = [] } = useQuery({
    queryKey: ["quizzes", courseId], enabled: paidAccess?.allowed===true,
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
  const quizzes = allQuizzes.filter(q => visibility && visibility[q.id] !== false);
  const activeQuiz = useMemo(() => quizzes.find((x) => x.id === quizId), [quizzes, quizId]);

  useEffect(() => {
    if (!course || paidAccess?.allowed !== true || quizId) return;
    const provide = (event: Event) => (event as StudyContextRequest).detail.provide({
      course: course.title,
      lesson: activeSection?.title ?? "Course overview",
      content: activeSection?.content ?? course.description ?? "",
    });
    window.addEventListener(MFP_STUDY_CONTEXT, provide);
    return () => window.removeEventListener(MFP_STUDY_CONTEXT, provide);
  }, [course, activeSection, paidAccess?.allowed, quizId]);

  useEffect(() => {
    if (activeSection) setOpenUnits((o) => ({ ...o, [activeSection.unit_id]: true }));
  }, [activeSection]);

  const [paying, setPaying] = useState(false);
  const canRead = paidAccess?.allowed === true;

  async function enroll() {
    if (!session) return;
    if (!paidAccess) return;
    if (paidAccess.paid) {
      setPaying(true);
      let res;
      try { res = await createCourseCheckout({ data: { courseId, plan } }); } catch { toast.error("Payment gateway access unavailable. Please try again later."); return; } finally { setPaying(false); }
      if (!res.ok) return void toast.error(res.error);
      window.location.href = res.checkout_url;
      return;
    }
    const { error } = await supabase.from("enrollments").insert({ user_id: session.user.id, course_id: courseId });
    if (error) return void toast.error(error.message);
    toast.success("You are enrolled — happy learning!");
    qc.invalidateQueries({ queryKey: ["enrollment", courseId] });
    qc.invalidateQueries({ queryKey: ["course-access", courseId] });
  }

  if (courseLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (courseError || !course) return <p role="alert">Course unavailable in this subject.</p>;

  return (
    <div className="lg:h-full lg:min-h-0">
      {/* Mobile: small course-index tab on the left edge (like Saylor) */}
      <button onClick={() => setMenuOpen(true)} aria-label="Open course index"
        className="fixed left-0 top-1/2 z-30 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card text-primary shadow lg:hidden">
        <List className="h-4 w-4" />
      </button>
      {menuOpen && <div className="fixed inset-0 z-40 bg-foreground/40 lg:hidden" onClick={() => setMenuOpen(false)} />}
    <div className="grid gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className={`${menuOpen ? "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-xs" : "hidden"} flex-col border-r border-border bg-card lg:relative lg:z-auto lg:flex lg:h-full lg:min-h-0 lg:w-auto lg:max-w-none lg:overflow-hidden lg:rounded-2xl lg:border`}>
        <div className="relative shrink-0 border-b border-border p-4 pr-12">
          <button onClick={() => setMenuOpen(false)} aria-label="Close course index" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-border lg:hidden"><X className="h-4 w-4" /></button>
          <p className="text-xs font-semibold tracking-[0.15em] text-primary">COURSE BOOK</p>
          <p className="mt-1 font-medium leading-snug">{course.code ? `${course.code}: ` : ""}{course.title}</p>
        </div>
        <nav aria-label="Course book" tabIndex={0} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
          <p className="rounded-md bg-accent px-2 py-2 text-sm font-semibold">Course Introduction</p>
          {!canRead && <p className="ml-4 px-2 py-1.5 text-[13px] text-muted-foreground">Enroll me in this course</p>}
          {canRead && numberError && <p role="alert" className="p-3 text-sm text-destructive">Could not load unit numbers. <button onClick={() => retryNumbers()} className="underline">Retry</button></p>}
          {canRead && units.map((u, i) => {
            const open = openUnits[u.id] ?? true;
            const unitSections = sections.filter((x) => x.unit_id === u.id);
            const unitQuizzes = quizzes.filter((x) => x.unit_id === u.id && !x.section_id);
            return (
              <div key={u.id}>
                <button onClick={() => setOpenUnits((o) => ({ ...o, [u.id]: !open }))}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-accent">
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-primary" />}
                  <span className="truncate">{unitNumbers ? (unitNumbers[u.id] ?? String(i + 1)) : "…"}. {u.title}</span>
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
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />{(qz as Quiz & { kind?: string }).kind === "exam" ? "Exam: " : "Quiz: "}{qz.title}
                      </Link>
                    ))])}
                    {unitQuizzes.map((qz) => (
                      <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id, paid: undefined }}
                        className={`flex items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-[13px] ${qz.id === activeQuiz?.id ? "bg-primary font-medium text-primary-foreground" : "text-foreground/80 hover:bg-accent"}`}>
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />{(qz as Quiz & { kind?: string }).kind === "exam" ? "Exam: " : "Quiz: "}{qz.title}
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

      <div ref={textbookRef} role="region" aria-label="Course textbook" tabIndex={0} className="min-w-0 space-y-6 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <header className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <p className="text-xs font-semibold tracking-[0.15em] text-primary">
            <Link to="/courses" className="hover:underline">COURSES</Link> / <Link to="/courses/$subjectId" params={{ subjectId }} className="hover:underline">SUBJECT</Link>
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">{course.code ? `${course.code}: ` : ""}{course.title}</h1>
          {course.description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{course.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {canRead && (paidAccess?.paid || enrollment) ? (
              <span className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />Enrolled
              </span>
            ) : session ? (
              <Button onClick={enroll} disabled={paying||!paidAccess||(paidAccess.paid && gatewayUnavailable)}><GraduationCap className="mr-1.5 h-4 w-4" />{paying ? "Opening payment…" : paidAccess?.paid ? "Pay for course access" : !paidAccess ? "Checking course access…" : "Enroll — Free"}</Button>
            ) : (
              <Button asChild><Link to="/auth" search={{ mode: "login" }}>Sign in to enroll</Link></Button>
            )}
            <Button variant="outline" size="sm" onClick={() => askMfp(`Help me understand the course "${course.title}". Course overview: ${course.description || "No overview provided."} Explain the main ideas and suggest how to study this subject.`)}><Sparkles className="mr-1.5 h-4 w-4" />Ask MFP about this course</Button>
            <span className="text-xs text-muted-foreground">Self-paced · No certificate</span>
          </div>
          {gatewayUnavailable && !canRead && (paidAccess?.paid || accessError || Number(course.price)>0) && <p role="status" className="mt-3 rounded-lg border border-border bg-muted/60 p-3 text-sm text-muted-foreground">Payment gateway access unavailable. PayMongo has not been set up yet.</p>}
          {accessError && !gatewayUnavailable && <p role="alert" className="mt-3 text-sm text-muted-foreground">Course access is temporarily unavailable. <button className="font-semibold text-primary underline" onClick={()=>void qc.invalidateQueries({queryKey:["course-access",courseId]})}>Retry</button></p>}
          {paidAccess?.paid && !canRead && <div className="mt-4 space-y-2"><label className="text-sm font-semibold" htmlFor="course-payment-plan">Choose your access</label><select id="course-payment-plan" value={plan} onChange={e=>setPlan(e.target.value as typeof plan)} className="block h-11 w-full rounded-lg border border-input bg-background px-3">{Number(course.price)>0&&<option value="once">One-time — ₱{course.price}</option>}{paidAccess.monthly>0&&<option value="monthly">Monthly — ₱{paidAccess.monthly}</option>}{paidAccess.yearly>0&&<option value="yearly">Yearly — ₱{paidAccess.yearly} paid in advance</option>}</select><p className="text-xs text-muted-foreground">Payment is required before lessons open. Monthly and yearly access renew manually.</p></div>}
          {paid === "1" && !canRead && (
            <p className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground">
              Confirming payment — lessons unlock after payment is verified.
            </p>
          )}
        </header>

        {!canRead ? (
          <section className="rounded-xl border border-border bg-card p-5 text-center sm:p-8">
            <h2 className="text-xl font-bold sm:text-2xl">Course Introduction</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{course.description || "Enroll to unlock the course book, lessons and quizzes."}</p>
            {session ? (
              <Button onClick={enroll} disabled={paying||!paidAccess||(paidAccess.paid && gatewayUnavailable)} className="mt-5">{paying ? "Opening payment…" : paidAccess?.paid ? "Pay for course access" : !paidAccess ? "Checking course access…" : "Enroll Me in This Course"}</Button>
            ) : (
              <Button asChild className="mt-5"><Link to="/auth" search={{ mode: "login" }}>Sign in to enroll</Link></Button>
            )}
            <p className="mt-2 text-xs italic text-muted-foreground">{paidAccess?.paid ? "Choose an access plan above. Payment is required." : !paidAccess ? "" : "Free · Self-paced"}</p>
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
                  <div className="mb-4 mt-5 flex flex-wrap items-center justify-end gap-2">
                    <Button className="mr-auto" size="sm" variant="outline" onClick={() => askMfp(buildTextbookQuestion({ course: course.title, unit: unit?.title ?? "", lesson: activeSection.title, content: activeSection.content }))}><Sparkles className="mr-1.5 h-4 w-4" />Ask MFP about this textbook</Button>
                    {prev && <Link {...go(prev.id)} aria-label="Previous page" className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-primary hover:bg-accent"><ArrowLeft className="h-5 w-5" /></Link>}
                    {next && <Link {...go(next.id)} aria-label="Next page" className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-primary hover:bg-accent"><ArrowRight className="h-5 w-5" /></Link>}
                  </div>
                  <LessonReader key={activeSection.id + ":" + activeSection.content}>
                    <h2 className="mb-2 font-sans text-xl font-bold tracking-tight text-foreground sm:text-3xl md:text-[2rem]">{activeSection.title}</h2>
                    {activeSection.content ? <RichContent text={activeSection.content} skip={activeSection.title} /> : <p className="text-sm text-muted-foreground">This section has no content yet.</p>}
                  </LessonReader>
                  {quizzes.filter((qz) => qz.section_id === activeSection.id).map((qz) => (
                    <Link key={qz.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId }} search={{ s: undefined, q: qz.id, paid: undefined }}
                      className="mt-6 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-accent/60 px-5 py-4 font-bold text-primary hover:bg-accent">
                      <ClipboardList className="h-5 w-5" />Take the {(qz as Quiz & { kind?: string }).kind === "exam" ? "exam" : "quiz"}: {qz.title}<ArrowRight className="ml-auto h-4 w-4" />
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

function QuizView({ quiz }: { quiz: Quiz; courseId: string }) {
  const q = quiz as Quiz & { kind?: string; time_limit_minutes?: number };
  const isExam = q.kind === "exam";
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 text-center lg:p-8">
      <p className="flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.15em] text-primary"><ClipboardList className="h-4 w-4" />{isExam ? "EXAM" : "QUIZ"}</p>
      <h2 className="text-2xl font-semibold">{quiz.title}</h2>
      <p className="text-sm text-muted-foreground">Pass mark {quiz.pass_percent}%{q.time_limit_minutes ? ` · Time limit ${q.time_limit_minutes} min` : " · No time limit"}</p>
      <p className="mx-auto max-w-md text-xs text-muted-foreground">Opens on its own page in full screen with your webcam on. The course book and MFP assistant are not available while you take it.</p>
      <Button asChild><Link to="/exam/$quizId" params={{ quizId: quiz.id }}>Start {isExam ? "exam" : "quiz"}</Link></Button>
    </section>
  );
}
