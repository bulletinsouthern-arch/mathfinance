import { studentProfile } from "@/lib/student.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const { session, username } = useAuth();
  const queryClient = useQueryClient();
  const {data:profile} = useQuery({queryKey:["student-profile",session?.user.id],queryFn:()=>studentProfile(),enabled:!!session});
  const [firstName,setFirstName]=useState("");
  const [lastName,setLastName]=useState("");
  const [saving,setSaving]=useState(false);
  useEffect(()=>{setFirstName(profile?.firstName || session?.user.user_metadata?.['first_name'] || "");setLastName(profile?.lastName || session?.user.user_metadata?.['last_name'] || "");},[profile,session?.user.id]);
  async function saveProfile(e:React.FormEvent) {
    e.preventDefault();setSaving(true);
    try {
      await studentProfile({data:{firstName,lastName}});
      const {error}=await supabase.auth.updateUser({data:{first_name:firstName.trim(),last_name:lastName.trim(),full_name:`${firstName.trim()} ${lastName.trim()}`}});
      if(error) throw error;
      await queryClient.invalidateQueries({queryKey:["student-profile",session?.user.id]});
      toast.success("Name saved for your account.");
    } catch(error) {toast.error(error instanceof Error?error.message:"Could not save details. Retry.");}
    finally {setSaving(false);}
  }
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
      <form onSubmit={saveProfile} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-2xl font-semibold">Your name</h2>
        <p className="text-sm text-muted-foreground">Only your first name and last name are required here. No program is needed. Your name is used across self-paced learning, quizzes, and exams.</p>
        <div><Label htmlFor="profile-first">First name</Label><Input id="profile-first" autoComplete="given-name" required maxLength={100} value={firstName} onChange={e=>setFirstName(e.target.value)} /></div>
        <div><Label htmlFor="profile-last">Last name</Label><Input id="profile-last" autoComplete="family-name" required maxLength={100} value={lastName} onChange={e=>setLastName(e.target.value)} /></div>
        <Button disabled={saving}>{saving?"Saving…":"Save name"}</Button>
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
