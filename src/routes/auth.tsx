import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isUsernameAvailable, signInWithUsername } from "@/lib/auth.functions";
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
      { name: "description", content: "Sign in with your username or create a free account." },
      { property: "og:title", content: "Sign In — Math & Finance Pro" },
      { property: "og:description", content: "Sign in or create your account." },
    ],
  }),
  component: AuthPage,
});

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[A-Za-z0-9_.]+$/, "Letters, numbers, _ and . only"),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

function AuthPage() {
  const { mode = "login", redirect: redirectTarget } = Route.useSearch();
  const navigate = useNavigate();
  const login = useServerFn(signInWithUsername);
  const checkName = useServerFn(isUsernameAvailable);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [f, setF] = useState({ username: "", email: "", password: "", confirm: "" });
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
    const identifier = f.username.trim();
    const password = f.password;

    try {
      // 1. If identifier is an email (contains @), attempt client-side login directly with Supabase
      if (identifier.includes("@")) {
        const { data: clientAuth, error: clientErr } = await supabase.auth.signInWithPassword({
          email: identifier.toLowerCase(),
          password,
        });
        if (!clientErr && clientAuth?.session) {
          setBusy(false);
          toast.success("Welcome back!");
          navigate({ to: (redirectTarget as never) || "/" });
          return;
        }
        if (clientErr) {
          if (clientErr.message.toLowerCase().includes("confirm")) {
            setBusy(false);
            setUnconfirmedEmail(identifier.toLowerCase());
            toast.error("Please confirm your email first — check your inbox for the confirmation link.");
            return;
          }
          if (clientErr.message.toLowerCase().includes("invalid login credentials")) {
            setBusy(false);
            toast.error("Invalid email or password. Please verify your credentials or create a new account.");
            return;
          }
        }
      }

      // 2. Try server function login (resolves username to email server-side)
      const res = await login({ data: { username: identifier, password } }).catch(() => null);
      if (res && res.ok && res.access_token && res.refresh_token) {
        await supabase.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
        setBusy(false);
        toast.success("Welcome back!");
        navigate({ to: (redirectTarget as never) || "/" });
        return;
      }

      // 3. If identifier is a username, check if we have a locally cached email from a previous signup
      const cachedEmail =
        typeof window !== "undefined"
          ? localStorage.getItem(`mfp_uname_${identifier.toLowerCase()}`)
          : null;
      if (cachedEmail) {
        const { data: clientAuth, error: clientErr } = await supabase.auth.signInWithPassword({
          email: cachedEmail,
          password,
        });
        if (!clientErr && clientAuth?.session) {
          setBusy(false);
          toast.success("Welcome back!");
          navigate({ to: (redirectTarget as never) || "/" });
          return;
        }
        if (clientErr?.message?.toLowerCase().includes("confirm")) {
          setBusy(false);
          setUnconfirmedEmail(cachedEmail);
          toast.error("Please confirm your email first — check your inbox for the confirmation link.");
          return;
        }
      }

      setBusy(false);
      const errMsg = res && !res.ok ? res.error : "Invalid username/email or password";
      toast.error(errMsg);
    } catch (err: unknown) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : "Sign in failed";
      toast.error(msg);
    }
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    const p = signupSchema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    if (f.password !== f.confirm) return void toast.error("Passwords do not match");
    setBusy(true);

    try {
      const checkRes = await checkName({ data: { username: p.data.username } }).catch(() => ({ available: true }));
      if (!checkRes?.available) {
        setBusy(false);
        return void toast.error("That username is taken");
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: p.data.email,
        password: p.data.password,
        options: { emailRedirectTo: window.location.origin, data: { username: p.data.username } },
      });

      if (error) {
        setBusy(false);
        const msg = error.message.toLowerCase();
        if (msg.includes("reserved")) return void toast.error("That username is reserved");
        if (
          msg.includes("duplicate") ||
          msg.includes("already registered") ||
          msg.includes("already taken") ||
          msg.includes("saving new user")
        ) {
          return void toast.error("That username or email is already registered");
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

      // Remember username-to-email mapping on this device
      try {
        localStorage.setItem(`mfp_uname_${p.data.username.trim().toLowerCase()}`, p.data.email.trim().toLowerCase());
      } catch (storageErr) {
        console.warn("Could not cache username locally:", storageErr);
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
              We sent a confirmation link to <b>{f.email}</b>. Click the link to activate your account, then sign in with your email or username.
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
              <p className="mt-1 text-xs text-muted-foreground">Sign in with your registered username or email.</p>
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
              <Label htmlFor="login-username">Username or email</Label>
              <Input
                id="login-username"
                className="mt-1"
                autoComplete="username"
                placeholder="you@example.com or username"
                required
                value={f.username}
                onChange={set("username")}
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
            <div>
              <Label htmlFor="signup-username">Username</Label>
              <Input
                id="signup-username"
                className="mt-1"
                autoComplete="username"
                placeholder="e.g. alex_99"
                required
                value={f.username}
                onChange={set("username")}
              />
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
