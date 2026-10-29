import { useState } from "react";
import { addAdministrator } from "@/lib/admin-access.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
export function AdminAccess() {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("Grant full administrator access to this registered account?")) return;
    setBusy(true);
    try {
      await addAdministrator({ data: { email } });
      setEmail("");
      toast.success(
        "Administrator added. They can refresh or sign in again to open the dashboard.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add administrator");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6"
    >
      <h2 className="text-2xl font-semibold">Administrator access</h2>
      <p className="text-sm text-muted-foreground">
        Enter the email of an existing registered account to grant full dashboard access, including
        courses, payments and student records.
      </p>
      <label className="block text-sm font-semibold" htmlFor="new-admin-email">
        Registered account email
      </label>
      <Input
        id="new-admin-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button disabled={busy}>{busy ? "Adding…" : "Add administrator"}</Button>
    </form>
  );
}
