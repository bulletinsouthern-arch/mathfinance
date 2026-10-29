import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { coursePlans } from "@/lib/course-plans.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
export function CoursePlans({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ["course-plans", courseId],
    queryFn: () => coursePlans({ data: { courseId } }),
  });
  const [monthly, setMonthly] = useState("0"),
    [yearly, setYearly] = useState("0"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) {
      setMonthly(String(data.monthly));
      setYearly(String(data.yearly));
    }
  }, [data]);
  async function save() {
    setBusy(true);
    try {
      await coursePlans({ data: { courseId, monthly: Number(monthly), yearly: Number(yearly) } });
      await qc.invalidateQueries({ queryKey: ["course-plans", courseId] });
      await qc.invalidateQueries({ queryKey: ["course-access", courseId] });
      toast.success("Payment plans saved");
    } catch {
      toast.error("Could not save payment plans");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <h4 className="font-semibold">Monthly & yearly course access</h4>
      <p className="text-sm text-muted-foreground">
        Set 0 to disable an option. Yearly access is paid in full in advance. Students renew
        manually when access expires. The course price above remains the one-time option; set all
        three prices to 0 for free access.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Monthly price ₱
          <Input
            type="number"
            min="0"
            step="0.01"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Yearly price ₱ (full year)
          <Input
            type="number"
            min="0"
            step="0.01"
            value={yearly}
            onChange={(e) => setYearly(e.target.value)}
          />
        </label>
      </div>
      {isError && <p role="alert">Could not load payment plans.</p>}
      <Button disabled={busy || !data} onClick={() => void save()}>
        {busy ? "Saving…" : "Save payment plans"}
      </Button>
    </section>
  );
}
