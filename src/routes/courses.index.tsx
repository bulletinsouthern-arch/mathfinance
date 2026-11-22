import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
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
  const [q, setQ] = useState("");
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const r = await supabase
        .from("subjects")
        .select("id, name, icon, description, sort_order")
        .order("sort_order");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
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
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courses.filter((c) =>
      `${c.code} ${c.title} ${c.description} ${details[c.id]?.skills ?? ""} ${details[c.id]?.sponsor ?? ""} ${subjects.find((s) => s.id === c.subject_id)?.name ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [courses, subjects, q, details]);
  return (
    <div className="course-experience space-y-8">
      <section className="space-y-5" aria-label="Course catalog">
        <h1 className="sr-only">Courses</h1>
        <div className="flex max-w-2xl items-center gap-3 rounded-full border border-border bg-card py-1.5 pl-5 pr-2 shadow-sm">
          <Search className="h-5 w-5 shrink-0 text-primary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="rounded-full px-3 py-2 text-xs font-semibold text-primary"
            >
              Clear
            </button>
          )}
        </div>
        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-96 animate-pulse rounded-xl border border-border bg-muted"
              />
            ))}
          </div>
        ) : isError ? (
          <p role="alert" className="rounded-xl border p-8">
            Courses could not be loaded.{" "}
            <button className="text-primary underline" onClick={() => void refetch()}>
              Try again
            </button>
          </p>
        ) : filtered.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((c) => (
              <CourseCatalogCard key={c.id} course={c} details={details[c.id]} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <h3 className="font-semibold">
              {courses.length ? "No matching courses" : "New courses are on the way"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {courses.length
                ? "Try another search or clear the search field."
                : "Check back soon to find your next course."}
            </p>
          </div>
        )}
      </section>
      {subjects.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Browse by subject</h2>
          <div className="flex flex-wrap gap-2">
            {subjects.map((sub) => (
              <Link
                key={sub.id}
                to="/courses/$subjectId"
                params={{ subjectId: sub.id }}
                className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold hover:border-primary hover:text-primary"
              >
                {sub.name}
                <ArrowRight className="ml-3 inline h-4 w-4" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
