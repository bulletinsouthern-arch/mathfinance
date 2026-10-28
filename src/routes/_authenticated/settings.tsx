import { useServerFn } from "@tanstack/react-start";
import { updateStudentName } from "@/lib/student.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account Settings — Math & Finance Pro" },
      { name: "description", content: "Change your email and password." },
      { property: "og:title", content: "Account Settings" },
      { property: "og:description", content: "Manage your account." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { session, username, refresh } = useAuth();
  const saveName = useServerFn(updateStudentName);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [email, setEmail] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: `${window.location.origin}/settings` });
    if (error) return void toast.error(error.message);
    toast.success("Check your inbox to confirm the new email address.");
    setEmail("");
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return void toast.error("Password must be at least 8 characters");
    if (pw !== confirm) return void toast.error("Passwords do not match");
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as never);
    if (error) return void toast.error(error.message);
    toast.success("Password updated");
    setCur(""); setPw(""); setConfirm("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-primary">SETTINGS</p>
        <h1 className="mt-1 text-4xl font-semibold">Your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as <b>{username}</b> · {session?.user.email}</p>
      </div>
      <form className="space-y-4 rounded-2xl border border-border bg-card p-6" onSubmit={async e => {
        e.preventDefault(); setSavingName(true);
        try { await saveName({ data: { first_name: firstName, last_name: lastName } }); await refresh(); toast.success("Full name updated"); }
        catch { toast.error("Could not update your name. Please try again."); }
        finally { setSavingName(false); }
      }}>
        <h2 className="text-2xl font-semibold">Your full name</h2>
        <p className="text-sm text-muted-foreground">Enter your first name and surname as they should appear on exam results.</p>
        <div><Label htmlFor="profile-first">First Name</Label><Input id="profile-first" autoComplete="given-name" required maxLength={100} value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div><Label htmlFor="profile-last">Last Name (Surname)</Label><Input id="profile-last" autoComplete="family-name" required maxLength={100} value={lastName} onChange={e => setLastName(e.target.value)} /></div>
        <Button disabled={savingName}>{savingName ? "Saving…" : "Save full name"}</Button>
      </form>
      <form onSubmit={changeEmail} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-2xl font-semibold">Change email</h2>
        <div><Label>New email</Label><Input className="mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <Button>Update email</Button>
      </form>
      <form onSubmit={changePassword} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-2xl font-semibold">Change password</h2>
        <div><Label>Current password</Label><Input className="mt-1" type="password" required value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><Label>New password</Label><Input className="mt-1" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><Label>Confirm new password</Label><Input className="mt-1" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        <Button>Update password</Button>
      </form>
    </div>
  );
}
