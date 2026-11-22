import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CourseCatalogCard } from "@/components/CourseCatalogCard";
import { listCoursePresentation } from "@/lib/course-presentation.functions";

export const Route = createFileRoute("/courses/")({
  validateSearch: (search): { q?: string } => {
    const rawQuery = search["q"];
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    return query ? { q: query } : {};
  },
  head: () => ({
    meta: [
      { title: "Courses — Math & Finance Pro" },
      { name: "description", content: "Explore self-paced courses in business, finance and math." },
    ],
  }),
  component: CourseCatalogPage,
});

function CourseCatalogPage() {
  const { q } = Route.useSearch();
  return <Courses query={q ?? ""} />;
}

export function Courses({ query = "" }: { query?: string }) {
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
  const term = query.toLowerCase();
  const matchingCourses = term
    ? courses.filter((course) =>
        [course.title, course.code, course.description].some((field) =>
          field?.toLowerCase().includes(term),
        ),
      )
    : courses;

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
      ) : matchingCourses.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {matchingCourses.map((course) => (
            <CourseCatalogCard key={course.id} course={course} details={details[course.id]} />
          ))}
        </div>
      ) : query ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <h2 className="font-semibold">No courses found</h2>
          <p className="mt-2 text-sm text-muted-foreground">No courses match “{query}”. Try a different keyword.</p>
          <Link to="/courses" search={{}} className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
            Clear search
          </Link>
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
