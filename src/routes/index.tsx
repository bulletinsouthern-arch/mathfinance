import { createFileRoute, Link } from "@tanstack/react-router";
import { Courses } from "./courses.index";
import { Calculator, ArrowRight } from "lucide-react";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courses — Math & Finance Pro" },
      { name: "description", content: "Explore courses by subject and learn at your own pace." },
    ],
  }),
  component: Home,
});
function Home() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-primary">LEARN AT YOUR PACE</p>
        <Link
          to="/formulas"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent"
        >
          <Calculator className="h-4 w-4" />
          Formula library
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <Courses />
    </div>
  );
}
