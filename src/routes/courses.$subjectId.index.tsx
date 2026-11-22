import { CourseCatalogCard } from "@/components/CourseCatalogCard";
import { listCoursePresentation } from "@/lib/course-presentation.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/courses/$subjectId/")({
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
    queryFn: async () =>
      (
        await supabase
          .from("subjects")
          .select("id, name, description")
          .eq("id", subjectId)
          .maybeSingle()
      ).data,
  });
  const {
    data: courses = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["subject-courses", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, code, title, description, price")
        .eq("subject_id", subjectId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: details = {} } = useQuery({
    queryKey: ["course-presentation"],
    queryFn: () => listCoursePresentation(),
  });

  return (
    <div className="course-experience mx-auto max-w-7xl space-y-6">
      <p className="text-sm text-muted-foreground">
        <Link to="/courses" className="text-primary hover:underline">
          Courses
        </Link>{" "}
        / {subject?.name ?? "…"}
      </p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {subject?.name || "Explore courses"}
      </h1>
      {subject?.description && (
        <p className="max-w-2xl text-[15px] leading-relaxed text-foreground/85">
          {subject.description}
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p role="alert">
          Courses could not be loaded.{" "}
          <button className="text-primary underline" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No courses in this subject yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <CourseCatalogCard
              key={c.id}
              course={{ ...c, subject_id: subjectId }}
              details={details[c.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
