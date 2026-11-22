import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CourseCatalogCard } from "@/components/CourseCatalogCard";
import { listCoursePresentation } from "@/lib/course-presentation.functions";

export const Route = createFileRoute("/courses/")({
  head: () => ({
    meta: [
      { title: "Courses — Math & Finance Pro" },
      { name: "description", content: "Explore self-paced courses in business, finance and math." },
    ],
  }),
  component: Courses,
});

export function Courses() {
  const {
    data: courses = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const r = await supabase
        .from("courses")
        .select("id, subject_id, code, title, description, price")
        .order("sort_order");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: details = {} } = useQuery({
    queryKey: ["course-presentation"],
    queryFn: () => listCoursePresentation(),
  });
  return (
    <section className="course-experience" aria-label="Course catalog">
      <h1 className="sr-only">Courses</h1>
      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-96 animate-pulse rounded-xl border border-border bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-xl border p-8">
          Courses could not be loaded.{" "}
          <button className="text-primary underline" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      ) : courses.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {courses.map((c) => (
            <CourseCatalogCard key={c.id} course={c} details={details[c.id]} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <h2 className="font-semibold">New courses are on the way</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Check back soon to find your next course.
          </p>
        </div>
      )}
    </section>
  );
}
