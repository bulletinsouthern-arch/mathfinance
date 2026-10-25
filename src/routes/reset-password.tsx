import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a New Password — Math & Finance Pro" },
      { name: "description", content: "Choose a new password for your account." },
      { property: "og:title", content: "Reset Password" },
      { property: "og:description", content: "Choose a new password." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return void toast.error("Password must be at least 8 characters");
    if (pw !== confirm) return void toast.error("Passwords do not match");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return void toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/" });
  }
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
        <h1 className="text-3xl font-semibold">Set a new password</h1>
        {!ready ? (
          <p className="mt-4 text-sm text-muted-foreground">Open this page from the reset link in your email.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div><Label>New password</Label><Input className="mt-1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div><Label>Confirm password</Label><Input className="mt-1" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            <Button className="w-full">Update password</Button>
          </form>
        )}
      </div>
    </div>
  );
}
