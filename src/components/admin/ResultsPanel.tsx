import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { listResults, decideRetake } from "@/lib/results.functions";
import { Button } from "@/components/ui/button";

export function ResultsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listResults);
  const decide = useServerFn(decideRetake);
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin-results"], queryFn: () => list(), retry: false,
  });
  const [course, setCourse] = useState("");
  const [assessment, setAssessment] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  if (isPending) return <p role="status" className="text-sm text-muted-foreground">Loading results…</p>;
  if (!data) return (
    <div role="alert" className="space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="text-sm">Results could not be loaded. Please try again. If your session has expired, sign in again.</p>
      <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>Try again</Button>
    </div>
  );
  const categories = [...new Map([...data.attempts,...data.requests].map((r:any)=>[r.quiz_id,{id:r.quiz_id,...r.quizzes}])).values()];
  const courses = [...new Map(categories.map(q=>[q.course_id,{id:q.course_id,title:q.courses?.title}])).values()].filter(c=>c.id);
  const matches = (r:any) => (!course || r.quizzes?.course_id===course) && (!assessment || r.quiz_id===assessment);
  const attempts = data.attempts.filter(matches);
  const requests = data.requests.filter(matches);
  const pending = requests.filter((r: any) => r.status === "pending");

  async function act(id: string, status: "accepted" | "rejected") {
    setActing(id);
    try { await decide({ data: { id, status, note: "" } }); toast.success(`Request ${status}`); qc.invalidateQueries({ queryKey: ["admin-results"] }); }
    catch { toast.error("The request could not be updated. Please try again."); }
    finally { setActing(null); }
  }

  return (
    <div className="space-y-8">
      {isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><p>Results could not be refreshed. Showing the last loaded results.</p><Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>Try again</Button></div>}
      {data.contactsUnavailable && <p role="status" className="text-sm text-muted-foreground">Some student contact details are unavailable. Results are shown below.</p>}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <label className="text-sm font-bold">Course<select aria-label="Filter by course" className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 font-normal" value={course} onChange={e=>{setCourse(e.target.value);setAssessment("");}}><option value="">All courses</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title || "Course"}</option>)}</select></label>
        <label className="text-sm font-bold">Exam or quiz<select aria-label="Filter by assessment" className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 font-normal" value={assessment} onChange={e=>setAssessment(e.target.value)}><option value="">All exams and quizzes</option>{categories.filter(q=>!course || q.course_id===course).map(q=><option key={q.id} value={q.id}>{q.title} ({q.kind || "quiz"})</option>)}</select></label>
      </div>
      <section>
        <h2 className="text-2xl font-semibold">Retake requests ({pending.length} pending)</h2>
        <div className="mt-3 space-y-2">
          {requests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {requests.map((r: any) => {
            const p = data.people[r.user_id];
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                <div>
                  <p className="font-bold">{p?.username || "Student"} · {r.quizzes?.title}</p><p className="text-xs text-muted-foreground">{r.quizzes?.courses?.title || "Course unavailable"} · {r.quizzes?.kind || "quiz"}</p>
                  <p className="text-xs text-muted-foreground">{p?.email} · {new Date(r.created_at).toLocaleString()}</p>
                  {r.message && <p className="mt-1 text-xs">“{r.message}”</p>}
                </div>
                {r.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={acting !== null} onClick={() => act(r.id, "accepted")}>{acting === r.id ? "Updating…" : "Accept"}</Button>
                    <Button size="sm" variant="outline" disabled={acting !== null} onClick={() => act(r.id, "rejected")}>Reject</Button>
                  </div>
                ) : <span className={`text-xs font-bold uppercase ${r.status === "accepted" ? "text-primary" : "text-destructive"}`}>{r.status}</span>}
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Exam & quiz results</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left"><tr>{["Student", "Email", "Assessment", "Date", "Score", "Result", ""].map((h) => <th key={h} className="p-2 font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {attempts.map((a: any) => {
                const p = data.people[a.user_id];
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-2 font-bold">{p?.username || "Student"}</td>
                    <td className="p-2">{p?.email || "Unavailable"}</td>
                    <td className="p-2">{a.quizzes?.courses?.title || "Course unavailable"} · {a.quizzes?.title} <span className="text-xs text-muted-foreground">({a.quizzes?.kind})</span></td>
                    <td className="p-2">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="p-2">{a.percent}% ({a.score}/{a.total})</td>
                    <td className={`p-2 font-bold ${a.passed ? "text-primary" : "text-destructive"}`}>{a.passed ? "Passed" : "Failed"}</td>
                    <td className="p-2">{p?.email && <a className="inline-flex items-center gap-1 text-primary underline" href={`mailto:${p.email}?subject=${encodeURIComponent("Your " + (a.quizzes?.title ?? "exam") + " result")}`}><Mail className="h-3 w-3" />Email</a>}</td>
                  </tr>
                );
              })}
              {attempts.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No exam or quiz results yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
