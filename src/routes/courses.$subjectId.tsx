import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/courses/$subjectId")({
  head: () => ({
    meta: [
      { title: "Subject Courses — Math & Finance Pro" },
      { name: "description", content: "Browse free self-paced courses in this subject." },
      { property: "og:title", content: "Subject Courses — Math & Finance Pro" },
      { property: "og:description", content: "Browse free self-paced courses in this subject." },
    ],
  }),
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectId } = Route.useParams();
  const { data: subject } = useQuery({
    queryKey: ["subject", subjectId],
    queryFn: async () => (await supabase.from("subjects").select("id, name, description").eq("id", subjectId).maybeSingle()).data,
  });
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["subject-courses", subjectId],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, description, price").eq("subject_id", subjectId).order("sort_order")).data ?? [],
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">
        <Link to="/courses" className="text-primary hover:underline">Courses</Link> / {subject?.name ?? "…"}
      </p>
      {subject?.description && <p className="max-w-2xl text-[15px] leading-relaxed text-foreground/85">{subject.description}</p>}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No courses in this subject yet.</div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {courses.map((c) => (
            <Link key={c.id} to="/courses/$subjectId/$courseId" params={{ subjectId, courseId: c.id }}
              className="group flex items-center gap-4 p-4 transition hover:bg-accent/60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpen className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.code ? `${c.code}: ` : ""}{c.title}</span>
                {c.description && <span className="block truncate text-xs text-muted-foreground">{c.description}</span>}
              </span>
              <span className="shrink-0 text-xs font-semibold text-primary">{c.price > 0 ? `$${c.price}` : "Free"}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-gold transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
