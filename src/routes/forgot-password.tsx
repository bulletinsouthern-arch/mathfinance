import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — Math & Finance Pro" },
      { name: "description", content: "Get a password reset link sent to your email." },
      { property: "og:title", content: "Forgot Password" },
      { property: "og:description", content: "Reset your Math & Finance Pro password." },
    ],
  }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setSent(true);
  }
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
        <h1 className="text-3xl font-semibold">Forgot password</h1>
        {sent ? (
          <p className="mt-4 text-sm text-muted-foreground">If an account exists for <b>{email}</b>, a reset link is on its way. Check your inbox.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">Enter the email on your account and we'll email you a reset link.</p>
            <div><Label>Email</Label><Input className="mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <Button className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
          </form>
        )}
        <Link to="/auth" search={{ mode: "login" }} className="mt-6 block text-center text-sm text-primary hover:underline">Back to sign in</Link>
      </div>
    </div>
  );
}
