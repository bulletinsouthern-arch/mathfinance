import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, GraduationCap, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/lib/settings";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/courses")({
  head: () => ({
    meta: [
      { title: "Courses — Math & Finance Pro" },
      { name: "description", content: "Free self-paced online courses in business, finance and math. Enroll anytime." },
      { property: "og:title", content: "Courses — Math & Finance Pro" },
      { property: "og:description", content: "Free self-paced online courses. Your pace. Your path. Your university." },
    ],
  }),
  component: Courses,
});

type Subject = { id: string; name: string; icon: string; description: string; sort_order: number };
type Course = { id: string; subject_id: string; code: string; title: string };

function Courses() {
  const s = useSiteSettings();
  const { session } = useAuth();
  const [q, setQ] = useState("");

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("id, name, icon, description, sort_order").order("sort_order")).data ?? [],
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => (await supabase.from("courses").select("id, subject_id, code, title").order("sort_order")).data ?? [],
  });
  const { data: stats } = useQuery({
    queryKey: ["stat-counts"],
    queryFn: async () => (await supabase.rpc("stat_counts")).data as { students: number; courses: number; free_courses: number; subjects: number } | null,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return subjects;
    const matchCourse = new Set(courses.filter((c) => `${c.code} ${c.title}`.toLowerCase().includes(needle)).map((c) => c.subject_id));
    return subjects.filter((sub) => sub.name.toLowerCase().includes(needle) || matchCourse.has(sub.id));
  }, [q, subjects, courses]);

  const countFor = (id: string) => courses.filter((c) => c.subject_id === id).length;

  const statItems: [string, string][] = [
    [String(stats?.students ?? 0), s.stat_students_label || "Students Enrolled"],
    [`${stats?.free_courses ?? 0}+`, s.stat_courses_label || "Free Courses"],
    [String(stats?.subjects ?? subjects.length), s.stat_subjects_label || "Specializations"],
    [s.stat_free_value || "100%", s.stat_free_label || "Free to Learn"],
  ];

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl bg-primary p-8 text-primary-foreground shadow-[var(--shadow-elegant)] lg:p-12">
        <div className="relative z-10 max-w-2xl">
          <h1 className="whitespace-pre-line text-4xl font-semibold leading-tight lg:text-5xl">{s.courses_hero_title || "Your Pace. Your Path.\nYour University."}</h1>
          <p className="mt-3 text-sm opacity-85">{s.courses_hero_sub || "100% Online · Self-Paced · Tuition Free · Enroll Anytime"}</p>
          <div className="mt-6 flex max-w-xl items-center gap-2 rounded-full bg-card px-5 py-1 text-foreground shadow-lg">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search free courses…" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
        </div>
        {session && (
          <Button asChild className="absolute right-6 top-6 z-10 bg-gold text-primary hover:bg-gold/90">
            <Link to="/dashboard">My Dashboard <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        )}
        <div className="relative z-10 mt-10 grid grid-cols-2 gap-6 border-t border-primary-foreground/20 pt-6 sm:grid-cols-4">
          {statItems.map(([v, l]) => (
            <div key={l} className="text-center">
              <p className="font-serif text-3xl font-semibold text-gold">{v}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] opacity-80">{l}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="border-b-2 border-primary pb-2 text-xl font-semibold">Browse by Subject</h2>
        {filtered.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            {subjects.length === 0 ? "Courses are on the way — check back soon." : "No subjects match your search."}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {filtered.map((sub) => (
              <Link key={sub.id} to="/courses/$subjectId" params={{ subjectId: sub.id }}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition hover:border-primary hover:shadow-[var(--shadow-elegant)]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{sub.name}</span>
                  {sub.description && <span className="block truncate text-xs text-muted-foreground">{sub.description}</span>}
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {countFor(sub.id)} <ArrowRight className="h-4 w-4 text-primary transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!session && (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center">
          <GraduationCap className="h-10 w-10 text-primary" />
          <h2 className="text-2xl font-semibold">Ready to start learning?</h2>
          <p className="max-w-md text-sm text-muted-foreground">Create a free account to enroll in courses, take quizzes and track your progress.</p>
          <Button asChild className="mt-2"><Link to="/auth" search={{ mode: "signup" }}>Get Started</Link></Button>
        </section>
      )}
    </div>
  );
}
