import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { administrators, updateAdministrator } from "@/lib/admin-access.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export function AdminAccess() {
  const [email, setEmail] = useState("");
  const [replacing, setReplacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const { data: admins = [], isPending, isError, refetch } = useQuery({ queryKey: ["administrators"], queryFn: () => administrators() });

  async function change(action: "add" | "remove" | "replace", userId?: string) {
    setBusy(true);
    try {
      const result = await updateAdministrator({ data: action === "remove"
        ? { action, userId: userId! }
        : action === "replace" ? { action, userId: userId!, email } : { action, email } });
      setEmail("");
      setReplacing(null);
      if (result.selfRemoved) {
        await refresh();
        window.location.assign("/dashboard");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["administrators"] });
      toast.success(action === "remove" ? "Administrator access removed" : action === "replace" ? "Administrator replaced" : "Administrator added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update administrator access");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-5 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-2xl font-semibold">Administrator access</h2>
      <p className="text-sm text-muted-foreground">Add a registered account by email, remove dashboard access, or replace an administrator. Removing access keeps their account and course history.</p>
      {isPending && <p role="status">Loading administrators…</p>}
      {isError && <p role="alert">Could not load administrators. <button className="underline" onClick={() => void refetch()}>Retry</button></p>}
      <ul className="divide-y divide-border">
        {admins.map((admin) => <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="break-all font-medium">{admin.username}{admin.current ? " (you)" : ""}</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => { setReplacing(admin.id); setEmail(""); }}>Replace</Button>
            <Button variant="destructive" disabled={busy || admins.length <= 1} onClick={() => void change("remove", admin.id)}>Remove</Button>
          </div>
        </li>)}
      </ul>
      {admins.length === 1 && <p className="text-sm text-muted-foreground">Replace the last administrator or add another before removing access.</p>}
      <form onSubmit={(event) => { event.preventDefault(); void change(replacing ? "replace" : "add", replacing ?? undefined); }} className="space-y-3 border-t border-border pt-4">
        <label className="block text-sm font-semibold" htmlFor="new-admin-email">{replacing ? `Replace ${admins.find((a) => a.id === replacing)?.username ?? "administrator"} with registered account email` : "Registered account email"}</label>
        <Input id="new-admin-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        <div className="flex gap-2">
          <Button disabled={busy || isPending || isError}>{busy ? "Saving…" : replacing ? "Replace administrator" : "Add administrator"}</Button>
          {replacing && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setReplacing(null); setEmail(""); }}>Cancel</Button>}
        </div>
      </form>
    </section>
  );
}
