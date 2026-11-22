import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/lib/settings";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
  const s = useSiteSettings();
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [price, setPrice] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState("");
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
  const levels = [
    ...new Set(
      Object.values(details)
        .map((d) => d.level)
        .filter(Boolean),
    ),
  ];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const result = courses.filter(
      (c) =>
        (!subject || c.subject_id === subject) &&
        (!price || (price === "free" ? Number(c.price) === 0 : Number(c.price) > 0)) &&
        (!level || details[c.id]?.level === level) &&
        `${c.code} ${c.title} ${c.description} ${details[c.id]?.skills ?? ""} ${details[c.id]?.sponsor ?? ""} ${subjects.find((s) => s.id === c.subject_id)?.name ?? ""}`
          .toLowerCase()
          .includes(needle),
    );
    return sort === "title"
      ? result.sort((a, b) => a.title.localeCompare(b.title))
      : sort === "price"
        ? result.sort((a, b) => Number(a.price) - Number(b.price))
        : result;
  }, [courses, subjects, q, subject, price, level, sort, details]);
  return (
    <div className="course-experience space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-accent/50 px-6 py-10 sm:px-10">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {s["site_name"] || "Math & Finance Pro"} · Online learning
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              {s["courses_hero_title"] || "Build skills. Open new possibilities."}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              {s["courses_hero_sub"] ||
                "Explore courses in math, finance and business. Learn at your own pace, one new skill at a time."}
            </p>
          </div>
          {session && (
            <Button asChild variant="outline">
              <Link to="/dashboard">
                My learning <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
        <div className="mt-7 flex max-w-2xl items-center gap-3 rounded-full border border-border bg-card py-1.5 pl-5 pr-2 shadow-sm">
          <Search className="h-5 w-5 shrink-0 text-primary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What do you want to learn?"
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
      </section>
      <section className="space-y-5" aria-label="Course catalog">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Explore our courses</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "course" : "courses"} to explore
            </p>
          </div>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            Find your next step
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            {
              label: "Subject",
              value: subject,
              set: setSubject,
              choices: subjects.map((s) => [s.id, s.name]),
            },
            {
              label: "Price",
              value: price,
              set: setPrice,
              choices: [
                ["free", "Free"],
                ["paid", "Paid"],
              ],
            },
            { label: "Level", value: level, set: setLevel, choices: levels.map((l) => [l, l]) },
            {
              label: "Sort",
              value: sort,
              set: setSort,
              choices: [
                ["title", "Title: A–Z"],
                ["price", "Price: low to high"],
              ],
            },
          ].map((f) => (
            <select
              key={f.label}
              aria-label={f.label}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="h-10 max-w-full rounded-full border border-border bg-card px-4 text-sm focus:ring-2 focus:ring-primary"
            >
              <option value="">
                {f.label === "Sort"
                  ? "Recommended order"
                  : f.label === "Price"
                    ? "All prices"
                    : `All ${f.label.toLowerCase()}s`}
              </option>
              {f.choices.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ))}
          {(subject || price || level || q) && (
            <button
              className="px-3 text-sm font-semibold text-primary hover:underline"
              onClick={() => {
                setSubject("");
                setPrice("");
                setLevel("");
                setQ("");
              }}
            >
              Reset filters
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
                ? "Try another search or reset your filters."
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
