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
  const { data, isLoading } = useQuery({ queryKey: ["admin-results"], queryFn: () => list() });
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading results…</p>;
  const pending = data.requests.filter((r: any) => r.status === "pending");

  async function act(id: string, status: "accepted" | "rejected") {
    try { await decide({ data: { id, status, note: "" } }); toast.success(`Request ${status}`); qc.invalidateQueries({ queryKey: ["admin-results"] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold">Retake requests ({pending.length} pending)</h2>
        <div className="mt-3 space-y-2">
          {data.requests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {data.requests.map((r: any) => {
            const p = data.people[r.user_id];
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                <div>
                  <p className="font-bold">{p?.username || "Student"} · {r.quizzes?.title}</p>
                  <p className="text-xs text-muted-foreground">{p?.email} · {new Date(r.created_at).toLocaleString()}</p>
                  {r.message && <p className="mt-1 text-xs">“{r.message}”</p>}
                </div>
                {r.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => act(r.id, "accepted")}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "rejected")}>Reject</Button>
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
              {data.attempts.map((a: any) => {
                const p = data.people[a.user_id];
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-2 font-bold">{p?.username}</td>
                    <td className="p-2">{p?.email}</td>
                    <td className="p-2">{a.quizzes?.title} <span className="text-xs text-muted-foreground">({a.quizzes?.kind})</span></td>
                    <td className="p-2">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="p-2">{a.percent}% ({a.score}/{a.total})</td>
                    <td className={`p-2 font-bold ${a.passed ? "text-primary" : "text-destructive"}`}>{a.passed ? "Passed" : "Failed"}</td>
                    <td className="p-2">{p?.email && <a className="inline-flex items-center gap-1 text-primary underline" href={`mailto:${p.email}?subject=${encodeURIComponent("Your " + (a.quizzes?.title ?? "exam") + " result")}`}><Mail className="h-3 w-3" />Email</a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
