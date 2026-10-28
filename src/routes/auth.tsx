import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/AppShell";

export const Route = createFileRoute("/auth")({
  validateSearch: (s) =>
    z.object({
      mode: z.enum(["login", "signup"]).optional(),
      redirect: z.string().optional(),
    }).parse(s),
  head: () => ({
    meta: [
      { title: "Sign In or Get Started — Math & Finance Pro" },
      { name: "description", content: "Sign in with your email or create a free account." },
      { property: "og:title", content: "Sign In — Math & Finance Pro" },
      { property: "og:description", content: "Sign in or create your account." },
    ],
  }),
  component: AuthPage,
});

const signupSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

function AuthPage() {
  const { mode = "login", redirect: redirectTarget } = Route.useSearch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", password: "", confirm: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  // If user is already logged in, redirect them to the destination
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: (redirectTarget as never) || "/" });
      }
    });
  }, [navigate, redirectTarget]);

  async function onResendEmail() {
    if (!unconfirmedEmail) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: unconfirmedEmail });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Confirmation email resent! Please check your inbox and spam folder.");
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
      if (error) {
        if (error.message.toLowerCase().includes("confirm")) setUnconfirmedEmail(f.email.trim());
        throw error;
      }
      toast.success("Welcome back!");
      navigate({ to: (redirectTarget as never) || "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid email or password");
    } finally { setBusy(false); }
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    const p = signupSchema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    if (f.password !== f.confirm) return void toast.error("Passwords do not match");
    setBusy(true);

    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: p.data.email,
        password: p.data.password,
        options: { emailRedirectTo: window.location.origin, data: { first_name: p.data.first_name, last_name: p.data.last_name, full_name: `${p.data.first_name} ${p.data.last_name}`, username: `u_${crypto.randomUUID().replaceAll("-", "").slice(0, 26)}` } },
      });

      if (error) {
        setBusy(false);
        const msg = error.message.toLowerCase();
        if (
          msg.includes("duplicate") ||
          msg.includes("already registered") ||
          msg.includes("already taken") ||
          msg.includes("saving new user")
        ) {
          return void toast.error("That email is already registered");
        }
        return void toast.error(error.message);
      }

      // Supabase returns an empty identities array if the email already belongs to an existing user
      if (signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
        setBusy(false);
        toast.info("An account with this email already exists. Please sign in or reset your password.");
        navigate({ to: "/auth", search: { mode: "login", redirect: redirectTarget } });
        return;
      }

      // If session is returned immediately (e.g. email confirmation off), log the user in right away
      if (signUpData?.session) {
        await supabase.auth.setSession(signUpData.session);
        setBusy(false);
        toast.success("Account created successfully!");
        navigate({ to: (redirectTarget as never) || "/" });
        return;
      }

      setBusy(false);
      setSent(true);
    } catch (err: unknown) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : "Account creation failed";
      toast.error(msg);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
        <Logo />
        <div className="mt-6 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          <Link
            to="/auth"
            search={{ mode: "login", redirect: redirectTarget }}
            className={`rounded-md py-2 text-center transition ${
              mode === "login" ? "bg-card font-medium shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup", redirect: redirectTarget }}
            className={`rounded-md py-2 text-center transition ${
              mode === "signup" ? "bg-card font-medium shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Get Started
          </Link>
        </div>

        {sent ? (
          <div className="mt-8 text-center space-y-4">
            <h1 className="text-3xl font-semibold">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              We sent a confirmation link to <b>{f.email}</b>. Click the link to activate your account, then sign in with your email.
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSent(false);
                  navigate({ to: "/auth", search: { mode: "login", redirect: redirectTarget } });
                }}
              >
                Go to Sign In
              </Button>
            </div>
          </div>
        ) : mode === "login" ? (
          <form onSubmit={onLogin} className="mt-6 space-y-4">
            <div>
              <h1 className="text-3xl font-semibold">Welcome back</h1>
              <p className="mt-1 text-xs text-muted-foreground">Sign in with your registered email.</p>
            </div>
            {unconfirmedEmail && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="font-semibold text-amber-300">Email Confirmation Required</p>
                <p className="mt-1">
                  We sent a confirmation link to <b>{unconfirmedEmail}</b>. Please check your inbox and click the link to activate your account.
                </p>
                <button
                  type="button"
                  onClick={onResendEmail}
                  disabled={busy}
                  className="mt-2 font-medium text-primary hover:underline underline-offset-2"
                >
                  Resend confirmation email
                </button>
              </div>
            )}
            <div>
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                className="mt-1"
                autoComplete="username"
                type="email" placeholder="you@example.com"
                required
                value={f.email}
                onChange={set("email")}
              />
            </div>
            <div>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                className="mt-1"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                required
                value={f.password}
                onChange={set("password")}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <Link
                to="/auth"
                search={{ mode: "signup", redirect: redirectTarget }}
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                Need an account? Get Started
              </Link>
              <Link to="/forgot-password" className="text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onSignup} className="mt-6 space-y-4">
            <div>
              <h1 className="text-3xl font-semibold">Create your account</h1>
              <p className="mt-1 text-xs text-muted-foreground">Join to save equations, track progress, and take exams.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="first-name">First name</Label><Input id="first-name" autoComplete="given-name" required maxLength={100} value={f.first_name} onChange={set("first_name")} /></div>
              <div><Label htmlFor="last-name">Last name</Label><Input id="last-name" autoComplete="family-name" required maxLength={100} value={f.last_name} onChange={set("last_name")} /></div>
            </div>
            <div>
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                className="mt-1"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={f.email}
                onChange={set("email")}
              />
            </div>
            <div>
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                className="mt-1"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                value={f.password}
                onChange={set("password")}
              />
            </div>
            <div>
              <Label htmlFor="signup-confirm">Confirm password</Label>
              <Input
                id="signup-confirm"
                className="mt-1"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                required
                value={f.confirm}
                onChange={set("confirm")}
              />
            </div>
            <Button className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Get Started"}
            </Button>
            <div className="text-center text-xs text-muted-foreground pt-1">
              Already have an account?{" "}
              <Link
                to="/auth"
                search={{ mode: "login", redirect: redirectTarget }}
                className="text-primary hover:underline font-medium"
              >
                Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
