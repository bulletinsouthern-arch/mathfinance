import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CheckCircle2, ClipboardList, Clock, GraduationCap, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My Dashboard — Math & Finance Pro" },
      { name: "description", content: "Your recently accessed courses, enrollments and quiz scores." },
      { property: "og:title", content: "My Dashboard" },
      { property: "og:description", content: "Your learning progress." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { session, username } = useAuth();
  const uid = session?.user.id;

  const { data: recent = [] } = useQuery({
    queryKey: ["recent-courses", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("course_views").select("course_id, viewed_at").eq("user_id", uid!).order("viewed_at", { ascending: false }).limit(8);
      const ids = (data ?? []).map((r) => r.course_id);
      if (!ids.length) return [];
      const { data: cs } = await supabase.from("courses").select("id, subject_id, code, title").in("id", ids);
      return ids.map((id) => cs?.find((c) => c.id === id)).filter(Boolean) as { id: string; subject_id: string; code: string; title: string }[];
    },
  });
  const { data: enrolled = [] } = useQuery({
    queryKey: ["my-enrollments", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("enrollments").select("course_id, enrolled_at").eq("user_id", uid!).order("enrolled_at", { ascending: false });
      const ids = (data ?? []).map((r) => r.course_id);
      if (!ids.length) return [];
      const { data: cs } = await supabase.from("courses").select("id, subject_id, code, title").in("id", ids);
      return (cs ?? []) as { id: string; subject_id: string; code: string; title: string }[];
    },
  });
  const { data: attempts = [] } = useQuery({
    queryKey: ["my-attempts", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("quiz_attempts").select("id, quiz_id, score, total, passed, created_at").eq("user_id", uid!).order("created_at", { ascending: false }).limit(10);
      const ids = [...new Set((data ?? []).map((a) => a.quiz_id))];
      const { data: qz } = ids.length ? await supabase.from("quizzes").select("id, title, course_id").in("id", ids) : { data: [] };
      return (data ?? []).map((a) => ({ ...a, quiz: qz?.find((q) => q.id === a.quiz_id) }));
    },
  });

  return (
    <div className="space-y-8">
      <header className="rounded-2xl bg-primary p-8 text-primary-foreground shadow-[var(--shadow-elegant)]">
        <p className="flex items-center gap-2 text-xs tracking-[0.2em] opacity-80"><GraduationCap className="h-4 w-4" />MY DASHBOARD</p>
        <h1 className="mt-2 text-4xl font-semibold">Welcome back, {username}</h1>
        <p className="mt-1 text-sm opacity-80">Pick up where you left off.</p>
      </header>

      <section>
        <h2 className="flex items-center gap-2 text-2xl font-semibold"><Clock className="h-5 w-5 text-primary" />Recently accessed courses</h2>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nothing here yet — <Link to="/courses" className="text-primary hover:underline">browse courses</Link> to get started.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((c) => (
              <Link key={c.id} to="/courses/$subjectId/$courseId" params={{ subjectId: c.subject_id, courseId: c.id }} search={{ s: undefined, q: undefined, paid: undefined }}
                className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary hover:shadow-[var(--shadow-elegant)]">
                <BookOpen className="h-6 w-6 text-primary" />
                <p className="mt-3 font-medium leading-snug">{c.code ? `${c.code}: ` : ""}{c.title}</p>
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">Continue <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-2xl font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" />My enrollments</h2>
          {enrolled.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">You are not enrolled in any course yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {enrolled.map((c) => (
                <li key={c.id}>
                  <Link to="/courses/$subjectId/$courseId" params={{ subjectId: c.subject_id, courseId: c.id }} search={{ s: undefined, q: undefined, paid: undefined }}
                    className="flex items-center justify-between gap-2 py-3 text-sm hover:text-primary">
                    <span className="truncate font-medium">{c.code ? `${c.code}: ` : ""}{c.title}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gold" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-2xl font-semibold"><ClipboardList className="h-5 w-5 text-primary" />Quiz scores</h2>
          {attempts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No quiz attempts yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {attempts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                  <span className="truncate">{a.quiz?.title ?? "Quiz"}</span>
                  <span className={`flex shrink-0 items-center gap-1.5 font-medium ${a.passed ? "text-primary" : "text-destructive"}`}>
                    {a.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {a.score}/{a.total} · {a.total ? Math.round((a.score / a.total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
