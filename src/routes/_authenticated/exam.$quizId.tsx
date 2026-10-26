import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ClipboardList, Clock, Maximize, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { gradeExam } from "@/lib/exam.functions";
import { MAX_WARNINGS, shouldAutoSubmit } from "@/lib/quiz";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/exam/$quizId")({
  head: () => ({
    meta: [
      { title: "Proctored Exam — Math & Finance Pro" },
      { name: "description", content: "Take your proctored quiz or exam in full screen with webcam on." },
      { property: "og:title", content: "Proctored Exam — Math & Finance Pro" },
      { property: "og:description", content: "Proctored quizzes and exams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExamPage,
});

type Q = { id: string; question: string; option_a: string; option_b: string; option_c: string; option_d: string; qtype: string; sort_order: number };
type Result = Awaited<ReturnType<typeof gradeExam>>;

function ExamPage() {
  const { quizId } = Route.useParams();
  const { session, username } = useAuth();
  const grade = useServerFn(gradeExam);
  const { data: quiz } = useQuery({
    queryKey: ["exam", quizId],
    queryFn: async () => (await supabase.from("quizzes").select("id,title,pass_percent,kind,time_limit_minutes,course_id").eq("id", quizId).maybeSingle()).data,
  });
  const { data: questions = [] } = useQuery({
    queryKey: ["exam-q", quizId],
    queryFn: async () => ((await supabase.from("quiz_questions").select("id,question,option_a,option_b,option_c,option_d,qtype,sort_order").eq("quiz_id", quizId).order("sort_order")).data ?? []) as Q[],
  });

  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState(0);
  const [alert, setAlert] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [fs, setFs] = useState(false);
  const submitted = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const warnRef = useRef(0);
  const isExam = quiz?.kind === "exam";
  const label = isExam ? "exam" : "quiz";
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const [inCall, setInCall] = useState(false);
  const { data: ban } = useQuery({
    queryKey: ["exam-ban", session?.user.id],
    enabled: !!session,
    queryFn: async () => (await supabase.from("exam_bans").select("until,reason").eq("user_id", session!.user.id).gt("until", new Date().toISOString()).order("until", { ascending: false }).limit(1).maybeSingle()).data,
  });

  async function startCam() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      if (video.current) video.current.srcObject = s;
      setCamOn(true);
    } catch {
      setAlert("Camera and microphone permission are required to take this " + label + ".");
    }
  }
  function stopCam() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => () => stopCam(), []);
  useEffect(() => { if (video.current && stream.current) video.current.srcObject = stream.current; }, [started, camOn]);

  const submit = useCallback(async (why?: string) => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try {
      const r = await grade({ data: { quizId, answers: answersRef.current, warnings: warnRef.current } });
      setResult(r);
      if (why) setAlert(why);
    } catch {
      submitted.current = false;
      setAlert("Could not submit. Please try again.");
    } finally {
      setBusy(false);
      stopCam();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }
  }, [grade, quizId]);

  async function begin() {
    if (!camOn) return;
    try { await wrap.current?.requestFullscreen(); } catch { /* some browsers refuse */ }
    setLeft((quiz?.time_limit_minutes ?? 0) * 60);
    setStarted(true);
  }

  // Anti-cheat: leaving full screen or switching tab/window counts as a warning.
  useEffect(() => {
    if (!started || result) return;
    const strike = (msg: string) => {
      if (submitted.current) return;
      warnRef.current += 1;
      setWarnings(warnRef.current);
      if (shouldAutoSubmit(warnRef.current)) void submit("Your " + label + " was submitted automatically because you left it more than " + MAX_WARNINGS + " times.");
      else setAlert(`Warning ${warnRef.current} of ${MAX_WARNINGS}: ${msg}`);
    };
    const onFs = () => { setFs(!!document.fullscreenElement); if (!document.fullscreenElement) strike("you left full screen."); };
    const onVis = () => { if (document.hidden) strike("you switched to another tab or app."); };
    const onBlur = () => { if (!document.hidden) strike("you clicked outside the " + label + " window."); };
    const block = (e: Event) => e.preventDefault();
    // Students cannot turn the mic/camera off: if a track is muted or stopped it counts as a warning.
    const tracks = stream.current?.getTracks() ?? [];
    const onTrackOff = (t: MediaStreamTrack) => () => strike(`your ${t.kind === "audio" ? "microphone" : "camera"} was turned off. Keep it on.`);
    const trackHandlers = tracks.map((t) => { const h = onTrackOff(t); t.addEventListener("mute", h); t.addEventListener("ended", h); return [t, h] as const; });
    setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    const cleanupTracks = () => trackHandlers.forEach(([t, h]) => { t.removeEventListener("mute", h); t.removeEventListener("ended", h); });
    return () => {
      cleanupTracks();
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
    };
  }, [started, result, submit, label]);

  // Timer
  useEffect(() => {
    if (!started || result || !quiz?.time_limit_minutes) return;
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { void submit("Time is up — your " + label + " was submitted."); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [started, result, quiz?.time_limit_minutes, submit, label]);

  // Live proctor feed: small camera snapshots broadcast to admins, plus a live
  // voice/video call the admin can open. Nothing is recorded or stored.
  useEffect(() => {
    if (!started || result || !session) return;
    const me = session.user.id;
    const ch = supabase.channel("proctor-live");
    let pc: RTCPeerConnection | null = null;
    const hang = () => { pc?.close(); pc = null; setInCall(false); if (remoteAudio.current) remoteAudio.current.srcObject = null; };
    ch.on("broadcast", { event: "admin" }, async ({ payload }) => {
      const p = payload as { to: string; type: string; text?: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
      if (p.to !== me) return;
      if (p.type === "warn") { setAlert("Message from proctor: " + (p.text ?? "")); return; }
      if (p.type === "kick") { hang(); void submit("You were removed from this " + label + " by the proctor." + (p.text ? " Reason: " + p.text : "")); return; }
      if (p.type === "hangup") { hang(); return; }
      if (p.type === "offer" && p.sdp) {
        hang();
        pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        stream.current?.getTracks().forEach((t) => pc!.addTrack(t, stream.current!));
        pc.ontrack = (e) => { if (remoteAudio.current) { remoteAudio.current.srcObject = e.streams[0] ?? null; void remoteAudio.current.play().catch(() => {}); } };
        pc.onicecandidate = (e) => { if (e.candidate) void ch.send({ type: "broadcast", event: "student", payload: { from: me, type: "ice", ice: e.candidate.toJSON() } }); };
        await pc.setRemoteDescription(p.sdp);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        void ch.send({ type: "broadcast", event: "student", payload: { from: me, type: "answer", sdp: ans } });
        setInCall(true);
        return;
      }
      if (p.type === "ice" && p.ice && pc) { try { await pc.addIceCandidate(p.ice); } catch { /* ignore */ } }
    });
    ch.subscribe();
    const canvas = document.createElement("canvas");
    canvas.width = 240; canvas.height = 180;
    const tick = () => {
      let frame = "";
      if (video.current && video.current.readyState >= 2) {
        canvas.getContext("2d")?.drawImage(video.current, 0, 0, 240, 180);
        frame = canvas.toDataURL("image/jpeg", 0.5);
      }
      const answered = Object.values(answersRef.current).filter((v) => v.trim()).length;
      void ch.send({ type: "broadcast", event: "frame", payload: {
        userId: me, name: username ?? session.user.email, exam: quiz?.title, frame,
        warnings: warnRef.current, mic: !!stream.current?.getAudioTracks().some((t) => t.readyState === "live" && !t.muted && t.enabled), fullscreen: !!document.fullscreenElement, focused: document.hasFocus() && !document.hidden,
        answered, total: questions.length, at: Date.now(),
      } });
    };
    const t = setInterval(tick, 2000);
    return () => {
      clearInterval(t);
      hang();
      void ch.send({ type: "broadcast", event: "leave", payload: { userId: me } }).finally(() => void supabase.removeChannel(ch));
    };
  }, [started, result, session, username, quiz?.title, questions.length, submit, label]);

  if (!quiz) return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>;
  if (ban && !started && !result) return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
      <h1 className="mt-3 font-sans text-xl font-bold">You can't take exams right now</h1>
      <p className="mt-2 text-sm text-muted-foreground">A proctor suspended your exam access until <b>{new Date(ban.until).toLocaleString()}</b>.{ban.reason ? ` Reason: ${ban.reason}` : ""}</p>
      <Button asChild variant="outline" className="mt-6"><Link to="/courses">Back to courses</Link></Button>
    </div>
  );
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");

  return (
    <div ref={wrap} className="min-h-screen overflow-y-auto bg-background">
      <audio ref={remoteAudio} autoPlay className="hidden" />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <ClipboardList className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.15em] text-primary">{isExam ? "PROCTORED EXAM" : "PROCTORED QUIZ"}</p>
            <h1 className="truncate font-sans text-lg font-bold sm:text-xl">{quiz.title}</h1>
          </div>
          {started && !result && quiz.time_limit_minutes > 0 && <span className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-bold"><Clock className="h-4 w-4" />{mm}:{ss}</span>}
          {started && !result && <span className={`rounded-full px-3 py-1 text-xs font-bold ${warnings ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>Warnings {warnings}/{MAX_WARNINGS}</span>}
        </header>

        {alert && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{alert}</span>
            <button className="text-xs underline" onClick={() => setAlert(null)}>OK</button>
          </div>
        )}
        {started && !result && !fs && (
          <Button variant="outline" className="w-full" onClick={() => void wrap.current?.requestFullscreen().catch(() => {})}><Maximize className="mr-2 h-4 w-4" />Return to full screen</Button>
        )}

        {!started && !result && (
          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-sans text-lg font-bold">Before you start</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Your webcam and microphone must stay on. A proctor may watch, listen and talk to you live (for example, to ask you to show your glasses or your desk). Nothing is recorded or saved.</li>
              <li>The {label} runs in full screen. Leaving full screen or switching tabs gives a warning. After {MAX_WARNINGS} warnings it is submitted automatically.</li>
              <li>The course book and the MFP assistant are not available.</li>
              <li>Pass mark: <b>{quiz.pass_percent}%</b>{quiz.time_limit_minutes ? <> · Time limit: <b>{quiz.time_limit_minutes} minutes</b></> : " · No time limit"} · {questions.length} questions</li>
            </ul>
            <div className="flex flex-col items-center gap-3">
              <video ref={video} autoPlay muted playsInline className={`h-40 w-56 rounded-lg bg-muted object-cover ${camOn ? "" : "hidden"}`} />
              {!camOn ? <Button onClick={startCam}><Camera className="mr-2 h-4 w-4" />Turn on webcam</Button>
                : <Button onClick={begin} disabled={questions.length === 0}><Maximize className="mr-2 h-4 w-4" />Start {label} in full screen</Button>}
            </div>
          </section>
        )}

        {started && !result && (
          <>
            <video ref={video} autoPlay muted playsInline className="fixed bottom-4 right-4 z-40 h-24 w-32 rounded-lg border-2 border-primary bg-muted object-cover shadow-lg" />
            {inCall && <p className="fixed bottom-32 right-4 z-40 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">● Proctor is on a call with you</p>}
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-bold">{i + 1}. {q.question}</p>
                {q.qtype === "open" ? (
                  <Textarea className="mt-3 min-h-28" placeholder="Write your answer…" value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([["a", q.option_a], ["b", q.option_b], ["c", q.option_c], ["d", q.option_d]] as const).filter(([, t]) => t).map(([l, t]) => (
                      <button key={l} onClick={() => setAnswers((a) => ({ ...a, [q.id]: l }))}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${answers[q.id] === l ? "border-primary bg-accent font-bold" : "border-border hover:border-primary"}`}>
                        <span className="mr-2 font-bold uppercase">{l}.</span>{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <Button className="w-full" disabled={busy} onClick={() => { if (confirm("Submit your answers now?")) void submit(); }}>{busy ? "Checking your answers…" : `Submit ${label}`}</Button>
          </>
        )}

        {result && (
          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <div className="text-center">
              <p className="text-5xl font-bold text-primary">{result.percent}%</p>
              <p className={`mt-2 text-sm font-bold ${result.passed ? "text-primary" : "text-destructive"}`}>{result.passed ? "Passed" : "Not passed"} · {result.score} of {result.total} correct · Pass mark {quiz.pass_percent}%</p>
            </div>
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                {result.results[q.id] ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div>
                  <p className="font-bold">{i + 1}. {q.question}</p>
                  {q.qtype === "open"
                    ? <p className="text-xs text-muted-foreground">Score {Math.round((result.openScores[q.id] ?? 0) * 100)}%{result.feedback[q.id] ? ` — ${result.feedback[q.id]}` : ""}</p>
                    : <p className="text-xs text-muted-foreground">Your answer: {(answers[q.id] ?? "—").toUpperCase()} · Correct: {(result.correct[q.id] ?? "").toUpperCase()}</p>}
                </div>
              </div>
            ))}
            <Button asChild variant="outline" className="w-full"><Link to="/courses">Back to courses</Link></Button>
          </section>
        )}
      </div>
    </div>
  );
}
