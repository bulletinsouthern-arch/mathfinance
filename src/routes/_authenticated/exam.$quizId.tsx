import { examRecovery, saveExamProgress } from '@/lib/exam-appeals.functions';
import { useStudentProctor } from "@/hooks/use-student-proctor";
import { recordAssessmentWarning, assessmentSuspension } from "@/lib/integrity.functions";
import { studentProfile } from "@/lib/student.functions";
import { assessmentAccess, requestAssessmentRetake } from "@/lib/assessment.functions";
import { getQuizQuestions } from "@/lib/authoring.functions";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ClipboardList, Clock, Maximize, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { gradeExam, explainExamAnswer } from "@/lib/exam.functions";
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
  const { session, username, isAdmin } = useAuth();
  const {data:profile,isPending:profilePending,isError:profileError}=useQuery({queryKey:["student-profile",session?.user.id],queryFn:()=>studentProfile(),enabled:!!session,refetchOnWindowFocus:false});
  const grade = useServerFn(gradeExam);
  const attemptId = useRef<string | null>(null);
  const { data: access, refetch: refreshAccess, isError: accessError } = useQuery({
    queryKey: ["assessment-access", quizId, session?.user.id],
    queryFn: () => assessmentAccess({data:{quizId}}),
    enabled: !!session,
    refetchOnWindowFocus: false,
  });
  const { data: quiz } = useQuery({
    queryKey: ["exam", quizId],
    queryFn: async () => (await supabase.from("quizzes").select("id,title,pass_percent,kind,time_limit_minutes,course_id").eq("id", quizId).maybeSingle()).data,
  });
  const { data: questions = [] } = useQuery({
    queryKey: ["exam-q", quizId],
    queryFn: async () => (await getQuizQuestions({data:{quizId,admin:false}})) as Q[],
  });

  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [paused,setPaused]=useState(false);
  const [warningSince,setWarningSince]=useState<string|null>(null);
  const [countdown,setCountdown]=useState(20);
  const spoken=useRef(false);
  useEffect(()=>{
    if(!warningSince || paused) {spoken.current=false;window.speechSynthesis?.cancel();return;}
    const update=()=>setCountdown(Math.max(0,20-Math.floor((Date.now()-new Date(warningSince).getTime())/1000)));
    update();const timer=setInterval(update,250);
    if(!spoken.current && 'speechSynthesis' in window) {
      spoken.current=true;const voice=new SpeechSynthesisUtterance('Please return to camera view and the exam window before the twenty second allowance ends, or your exam access will be suspended.');voice.lang='en-US';window.speechSynthesis.speak(voice);
    }
    return ()=>clearInterval(timer);
  },[warningSince,paused]);
  const [locked, setLocked] = useState(false);
  const [starting, setStarting] = useState(false);
  const lockReason = useRef<string | null>(null);
  const frozenAnswers = useRef<Record<string, string> | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [fs, setFs] = useState(false);
  const submitted = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const warnRef = useRef(0);
  const [warnings,setWarnings]=useState(0);
  const lastWarning=useRef(-Infinity);
  const pendingWarnings=useRef<{attemptId:string;number:number;reason:string}[]>([]);
  const warningSave=useRef<Promise<void>>(Promise.resolve());
  const flushWarnings=useCallback(()=>{
    warningSave.current=warningSave.current.catch(()=>{}).then(async()=>{
      while(pendingWarnings.current.length) {
        await recordAssessmentWarning({data:pendingWarnings.current[0]!});
        pendingWarnings.current.shift();
      }
    });
    return warningSave.current;
  },[]);
  const isExam = quiz?.kind === "exam";
  const label = isExam ? "exam" : "quiz";
  const [inCall, setInCall] = useState(false);
  const { data: ban } = useQuery({
    queryKey: ["exam-ban", session?.user.id],
    enabled: !!session,
    queryFn: async () => (await supabase.from("exam_bans").select("until,reason").eq("user_id", session!.user.id).gt("until", new Date().toISOString()).order("until", { ascending: false }).limit(1).maybeSingle()).data,
  });

  const {data:reviewBan}=useQuery({queryKey:["assessment-suspension",session?.user.id],enabled:!!session,queryFn:()=>assessmentSuspension()});
  const activeBan=reviewBan ?? ban;

  async function startCam() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20, max: 24 } }, audio: { echoCancellation: true, noiseSuppression: true } });
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
    if (submitted.current || paused) return;
    submitted.current = true;
    setBusy(true);
    setLocked(true);
    frozenAnswers.current ??= { ...answersRef.current };
    if (why) lockReason.current = why;
    try {
      await flushWarnings();
      const r = await grade({ data: { quizId, attemptId: attemptId.current!, answers: frozenAnswers.current, warnings: warnRef.current } });
      setResult(r);
      if (lockReason.current) setAlert(lockReason.current);
      stopCam();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {
      submitted.current = false;
      setAlert("Could not submit. Your answers remain locked. Check your connection and retry submission.");
    } finally {
      setBusy(false);
    }
  }, [grade, quizId, flushWarnings, paused]);

  const strike = useCallback((reason: string) => {
    if (submitted.current || lockReason.current || !attemptId.current) return;
    // A single focus departure can emit blur, visibility and fullscreen events.
    if (Date.now()-lastWarning.current<1500) return;
    lastWarning.current=Date.now();
    warnRef.current=Math.min(3,warnRef.current+1);
    setWarnings(warnRef.current);
    pendingWarnings.current.push({attemptId:attemptId.current,number:warnRef.current,reason});
    void flushWarnings().catch(()=>setAlert("Warning could not be saved. Submission retries saving it; keep this page open."));
    if(warnRef.current<3) {
      setAlert(`Warning ${warnRef.current} of 3: ${reason} Three warnings end this attempt for administrator review.`);
      return;
    }
    lockReason.current=`Warning 3 of 3: Your ${label} answers are locked and submitted for administrator review. This does not by itself establish cheating.`;
    void submit(lockReason.current);
  }, [label, submit, flushWarnings]);

  useBlocker({
    disabled: !started || !!result || paused,
    enableBeforeUnload: true,
    shouldBlockFn: () => {
      strike("you attempted to leave the assessment page.");
      return true;
    },
  });

  async function begin() {
    if (starting || !camOn || !access?.eligible || !access.enabled || !profile) return;
    setStarting(true);
    setAlert(null);
    try {
      if (!wrap.current?.requestFullscreen) throw new Error("Fullscreen unavailable");
      await wrap.current.requestFullscreen();
      if (document.fullscreenElement !== wrap.current) throw new Error("Fullscreen required");
      setFs(true);
    } catch {
      {
        setAlert("Fullscreen is required to start. Allow fullscreen and try again using a supported browser.");
        setStarting(false);
        return;
      }
    }
    try {
      const admitted = await assessmentAccess({data:{quizId,begin:true}});
      attemptId.current = admitted.id;
      if ('answers' in admitted && admitted.answers) setAnswers(admitted.answers);
      if ('remaining' in admitted && admitted.remaining != null) setLeft(admitted.remaining);
      else setLeft((quiz?.time_limit_minutes ?? 0)*60);
    } catch (error) {
      setAlert(error instanceof Error ? error.message : "Could not start. Please retry.");
      setStarting(false);
      void refreshAccess();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      return;
    }

    setStarted(true);
    setStarting(false);
  }

  // Anti-cheat: leaving full screen or switching tab/window counts as a warning.
  useEffect(() => {
    if (!started || result || paused) return;
    const onFs = () => { setFs(!!document.fullscreenElement); if (document.fullscreenElement !== wrap.current) strike("you left full screen."); };
    const onVis = () => { if (document.hidden) strike("you switched to another tab or app."); };
    const onBlur = () => { if (!document.hidden) strike("you clicked outside the " + label + " window."); };
    const block = (e: Event) => e.preventDefault();
    const clipboard = (e: Event) => { e.preventDefault(); strike(`Blocked ${e.type}: copying, cutting and pasting are not allowed during assessments.`); };
    // Students cannot turn the mic/camera off: if a track is muted or stopped it counts as a warning.
    const tracks = stream.current?.getTracks() ?? [];
    const onTrackOff = (t: MediaStreamTrack) => () => strike(`your ${t.kind === "audio" ? "microphone" : "camera"} was turned off. Keep it on.`);
    const trackHandlers = tracks.map((t) => { const h = onTrackOff(t); t.addEventListener("mute", h); t.addEventListener("ended", h); return [t, h] as const; });
    onFs();
    if (document.hidden || !document.hasFocus()) strike("the assessment window lost focus.");
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", clipboard);
    document.addEventListener("paste", clipboard);
    document.addEventListener("cut", clipboard);
    document.addEventListener("contextmenu", block);
    const cleanupTracks = () => trackHandlers.forEach(([t, h]) => { t.removeEventListener("mute", h); t.removeEventListener("ended", h); });
    return () => {
      cleanupTracks();
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", clipboard);
      document.removeEventListener("paste", clipboard);
      document.removeEventListener("cut", clipboard);
      document.removeEventListener("contextmenu", block);
    };
  }, [started, result, paused, strike, label]);

  // Timer
  useEffect(() => {
    if (!started || result || paused || !quiz?.time_limit_minutes) return;
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { void submit("Time is up — your " + label + " was submitted."); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [started, result, paused, quiz?.time_limit_minutes, submit, label]);

  const progress=useRef({answers,left});progress.current={answers,left};
  useEffect(()=>{
    if(!started || result || paused || !attemptId.current) return;
    const save=()=>saveExamProgress({data:{attemptId:attemptId.current!,answers:progress.current.answers,remaining:progress.current.left}}).catch(()=>setAlert('Answers could not be saved. Check your connection; keep this page open.'));
    void save();const timer=setInterval(()=>void save(),3000);return ()=>clearInterval(timer);
  },[started,result,paused]);
  function pauseAttempt(reason:string) {
    setPaused(true);setLocked(true);setAlert(reason);stopCam();
    if(document.fullscreenElement) void document.exitFullscreen().catch(()=>{});
  }
  useStudentProctor({
    active: started && !result && !paused && !!session,
    attemptId: attemptId.current,
    stream: stream.current,
    answered: Object.values(answers).filter(v=>v.trim()).length,
    total: questions.length,
    onMessage: setAlert,
    onCall: setInCall,
    onWarning: setWarningSince,
    onSuspend: ()=>pauseAttempt("Your assessment is suspended. Submit an appeal to resume your saved attempt without a retake."),
    onKick: reason=>pauseAttempt("Removed by the proctor. "+reason+" Submit an appeal to resume."),
  });

  if (!quiz) return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>;
  if (activeBan && !started && !result) return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
      <h1 className="mt-3 font-sans text-xl font-bold">You can't take exams right now</h1>
      <p className="mt-2 text-sm text-muted-foreground">A proctor suspended your exam access until <b>{new Date(activeBan.until).toLocaleString()}</b>.{activeBan.reason ? ` Reason: ${activeBan.reason}` : ""}</p>
      <AppealRequest quizId={quizId} /><Button asChild variant="outline" className="mt-6"><Link to="/courses">Back to courses</Link></Button>
    </div>
  );
  if (!started && !result && accessError) return <div role="alert" className="space-y-3 p-10 text-center"><p>Could not verify assessment access.</p><Button onClick={()=>void refreshAccess()}>Retry access check</Button></div>;
  if (!started && !result && !access) return <p className="p-10 text-center">Checking assessment access… Please retry the page if this does not complete.</p>;
  if (!started && !result && access && (!access.enabled || !access.eligible)) return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-bold">{!access.enabled ? "This assessment is currently turned off" : `You already finished your ${label}, or an earlier attempt was interrupted`}</h1>
      <p>{!access.enabled ? "Your administrator controls when it is available." : "Please click Request Retake and wait for the admin to verify it. This applies across restarts and devices."}</p>
      {access.enabled && <AppealRequest quizId={quizId} fallback={<RetakeRequest quizId={quizId} userId={session?.user.id} />} />}
      <Button variant="outline" onClick={() => void refreshAccess()}>Check approval</Button>
      <Button asChild variant="outline"><Link to="/courses">Back to courses</Link></Button>
    </div>
  );
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");

  return (
    <div ref={wrap} className="min-h-screen overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <ClipboardList className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.15em] text-primary">{isExam ? "PROCTORED EXAM" : "PROCTORED QUIZ"}</p>
            <h1 className="truncate font-sans text-lg font-bold sm:text-xl">{quiz.title}</h1>
          </div>
          {started && !result && quiz.time_limit_minutes > 0 && <span className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-bold"><Clock className="h-4 w-4" />{mm}:{ss}</span>}
        </header>

        {started && !result && !paused && warningSince && <aside className="sticky top-2 z-50 rounded-xl border-2 border-amber-500 bg-background p-4 shadow-lg" role="alert"><p className="font-bold text-amber-700">{`Return to your device — ${countdown} seconds remaining`}</p><p className="text-sm">Please return to camera view and keep the exam window active before the 20-second allowance ends.</p></aside>}
        {paused && <section className="space-y-3 rounded-xl border border-destructive p-5"><h2 className="font-bold">Assessment paused — appeal to resume</h2><p>Your latest saved answers are preserved. Power or internet loss can be explained in your appeal. Administrator approval restores this attempt without a retake.</p><AppealRequest quizId={quizId} /></section>}
        {started && !result && <p role="status" className="rounded-lg border border-border p-3 text-sm font-bold">Warnings: {warnings} of 3</p>}
        {started && !result && <Button type="button" size="sm" variant="outline" onClick={()=>{window.dispatchEvent(new Event("enable-proctor-sound"));if('speechSynthesis' in window){const voice=new SpeechSynthesisUtterance('Spoken exam reminders are enabled. Please stay in camera view.');voice.lang='en-US';window.speechSynthesis.speak(voice);}}}>Enable proctor sound</Button>}
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
              <li>Your webcam and microphone must stay on. A proctor may watch, listen and talk to you live (for example, to ask you to show your glasses or your desk). Only authorized administrators receive your live video and audio. Media is not recorded. During visual checks, camera samples are sent to the configured Ollama service to check whether a person is visible; timed flags and browser events are saved for review. Remain visible in the camera; natural movements and head turns are allowed.</li>
              <li>The {label} runs in full screen. Leaving full screen, switching tabs or apps, losing window focus, turning off your camera/microphone, or attempting to copy, cut or paste adds a warning. At 3 of 3 warnings, answers lock and the attempt is submitted for administrator review. Leaving the exam tab or window, or consecutive confident checks showing nobody visible in the camera, for more than 20 seconds suspends assessment access for up to 14 days. Return to camera view before the 20-second countdown ends. Uncertain or unavailable camera checks do not count as absence. Spoken reminders depend on browser audio support. You may appeal power or internet outages; an administrator can restore your saved attempt without a retake. Browser and device exit controls cannot be disabled by this website.</li>
              <li>The course book and the MFP assistant are not available.</li>
              <li>Pass mark: <b>{quiz.pass_percent}%</b>{quiz.time_limit_minutes ? <> · Time limit: <b>{quiz.time_limit_minutes} minutes</b></> : " · No time limit"} · {questions.length} questions</li>
            </ul>
            {!profile && <div role="status" className="rounded-lg border border-border p-4 text-sm">{profilePending ? "Checking student details…" : profileError ? "Could not verify student details. Open Account Settings and retry." : "Complete your first name and last name before starting."} <Link to="/settings" className="font-bold text-primary underline">Account Settings</Link></div>}
            <div className="flex flex-col items-center gap-3">
              <video ref={video} autoPlay muted playsInline style={{ transform: "scaleX(-1)" }} aria-label="Your mirrored camera preview" className={`h-40 w-56 rounded-lg bg-muted object-cover ${camOn ? "" : "hidden"}`} />
              {!camOn && <Button variant={isAdmin ? "outline" : "default"} onClick={startCam}><Camera className="mr-2 h-4 w-4" />Turn on webcam</Button>}
              {camOn && <Button onClick={() => void begin()} disabled={starting || questions.length === 0 || !profile}><Maximize className="mr-2 h-4 w-4" />Start {label} in full screen</Button>}
              <p className="text-xs text-muted-foreground">Fullscreen and exam rules apply to every participant, including admins.</p>
            </div>
          </section>
        )}

        {started && !result && locked && !paused && (
          <section role="status" className="space-y-4 rounded-2xl border border-destructive/40 bg-card p-6">
            <h2 className="text-lg font-bold">{label === "exam" ? "Exam" : "Quiz"} answers locked</h2>
            <p className="text-sm text-muted-foreground">{lockReason.current ?? "Your answers are final."} You cannot change answers or resume this attempt.</p>
            <Button className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting locked answers…" : "Retry submission"}</Button>
          </section>
        )}

        {started && !result && !locked && (
          <>
            <video ref={video} autoPlay muted playsInline style={{ transform: "scaleX(-1)" }} aria-label="Your mirrored camera preview" className="fixed bottom-4 right-4 z-40 h-24 w-32 rounded-lg border-2 border-primary bg-muted object-cover shadow-lg" />
            {inCall && <p className="fixed bottom-32 right-4 z-40 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">● Proctor is on a call with you</p>}
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-bold">{i + 1}. {q.question}</p>
                {q.qtype === "open" ? (
                  <Textarea className="mt-3 min-h-28" placeholder="Write your answer…" value={answers[q.id] ?? ""} onChange={(e) => { if (!frozenAnswers.current) setAnswers((a) => ({ ...a, [q.id]: e.target.value })); }} />
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([["a", q.option_a], ["b", q.option_b], ["c", q.option_c], ["d", q.option_d]] as const).filter(([, t]) => t).map(([l, t]) => (
                      <button key={l} onClick={() => { if (!frozenAnswers.current) setAnswers((a) => ({ ...a, [q.id]: l })); }}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${answers[q.id] === l ? "border-primary bg-accent font-bold" : "border-border hover:border-primary"}`}>
                        <span className="mr-2 font-bold uppercase">{l}.</span>{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <Button className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Checking your answers…" : `Submit ${label}`}</Button>
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
                  <p className="mt-1 text-xs text-muted-foreground">Your answer: {q.qtype === "open" ? answers[q.id] || "No answer" : answers[q.id] ? `${(answers[q.id] ?? "").toUpperCase()}. ${q[`option_${answers[q.id]}` as keyof Q] ?? ""}` : "No answer"}</p>
                  <p className="mt-1 text-xs">Correct answer: {q.qtype !== "open" && result.correct[q.id] ? `${(result.correct[q.id] ?? "").toUpperCase()}. ` : ""}{result.answerText?.[q.id]}</p>
                  {q.qtype === "open" && <p className="text-xs text-muted-foreground">Score {Math.round((result.openScores[q.id] ?? 0) * 100)}%</p>}
                  <AnswerExplanation quizId={quizId} questionId={q.id} answer={answers[q.id] ?? ""} initial={[result.explanations?.[q.id], result.feedback[q.id]].filter(Boolean).join("\n")} />
                </div>
              </div>
            ))}
            <RetakeRequest quizId={quizId} userId={session?.user.id} />
            <Button asChild variant="outline" className="w-full"><Link to="/courses">Back to courses</Link></Button>
          </section>
        )}
      </div>
    </div>
  );
}

function AppealRequest({quizId,fallback}:{quizId:string;fallback?:React.ReactNode}) {
 const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const {data,refetch,isPending}=useQuery({queryKey:['exam-recovery',quizId],queryFn:()=>examRecovery({data:{quizId}}),refetchInterval:10000});
 async function send(){setBusy(true);setError('');try{await examRecovery({data:{quizId,reason}});void refetch();}catch{setError('Could not submit appeal. Check your connection and retry.');}finally{setBusy(false);}}
 if(isPending) return <p>Checking saved attempt…</p>;
 if(data===null) return <>{fallback}</>;
 return <div className="my-3 space-y-2 rounded-lg border p-4 text-left"><h3 className="font-bold">Appeal suspension / interrupted attempt</h3>{data?.status==='pending' ? <p>Your appeal is pending administrator review. No retake request is needed.</p> : <><p className="text-sm">Explain what happened, including power loss or an internet outage. Approval allows your saved attempt to resume.</p>{data?.note && <p className="text-sm">Administrator: {data.note}</p>}<Textarea aria-label="Appeal reason" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the interruption and when it happened" /><Button disabled={busy || reason.trim().length<5} onClick={()=>void send()}>{busy?'Sending…':'Submit appeal'}</Button></>}{error && <p role="alert">{error}</p>}<Button variant="outline" onClick={()=>window.location.reload()}>Check approval & resume</Button></div>;
}

function RetakeRequest({ quizId, userId }: { quizId: string; userId: string | undefined }) {
  const [msg, setMsg] = useState("");
  const { data: req, refetch } = useQuery({
    queryKey: ["retake-req", quizId, userId],
    enabled: !!userId,
    queryFn: () => requestAssessmentRetake({data:{quizId}}),
  });
  async function send() {
    if (!userId) return;
    try {
      await requestAssessmentRetake({data:{quizId,message:msg.slice(0,500)}});
      void refetch();
    } catch (error) { setMsg(error instanceof Error ? error.message : "Could not request retake. Retry."); }
  }
  if (req?.status === "pending") return <p className="rounded-lg bg-accent p-3 text-center text-sm font-bold">Retake requested. An admin will review your request within 24 hours.</p>;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      {req?.status === "rejected" && <p className="text-xs font-bold text-destructive">Your last retake request was declined.</p>}
      <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Reason for retake (optional)" rows={2} />
      <Button className="w-full" onClick={send}>Request Retake</Button>
      <p className="text-center text-xs text-muted-foreground">Admins review retake requests within 24 hours.</p>
    </div>
  );
}

function AnswerExplanation({
  quizId,
  questionId,
  answer,
  initial,
}: {
  quizId: string;
  questionId: string;
  answer: string;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function explain() {
    setBusy(true);
    setError("");
    try {
      const r = await explainExamAnswer({ data: { quizId, questionId, answer } });
      if (r.ok) setText(r.reply);
      else setError(r.error);
    } catch {
      setError("The explanation could not finish. Retry to ask Ollama again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 space-y-2">
      {text && <p className="whitespace-pre-wrap text-sm">{text}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {!text && (
        <Button variant="outline" size="sm" disabled={busy} onClick={explain}>
          {busy ? "Preparing explanation…" : "Explain why"}
        </Button>
      )}
    </div>
  );
}
