import { MfpPracticeQuiz } from "./MfpPracticeQuiz";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { CalendarDays, Rocket, Zap, Mic, Pause, Play, Square, Volume2, History, ImagePlus, Maximize2, Minimize2, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { MFP_ASK, getStudyContext, type StudyContext } from "@/lib/mfp-bus";
import { buildQuizPrompt, buildStudyPrompt, quizLabel, quizOptions, type QuizFormat, type QuizSettings, type StudyAction } from "@/lib/mfp-study";
import { useSiteSettings } from "@/lib/settings";
import { mfpChat } from "@/lib/ai.functions";
import { mfpCreateImage } from "@/lib/mfp-image.functions";
import { downloadAnswer, printAnswer } from "@/lib/mfp-export";
import { MfpQuizSetup } from "@/components/MfpQuizSetup";

import { useAuth } from "@/hooks/use-auth";
import { mfpHistory } from "@/lib/mfp-history.functions";

import { useMfpVoice } from "@/lib/use-mfp-voice";

// display: short text shown in the bubble when content is a long study prompt.
// quiz: set on the first message of a Quiz Me chat so answers get the right controls.
type Msg = { role: "user" | "assistant"; content: string; image?: string; display?: string | undefined; quiz?: QuizFormat | undefined };
type Chat = { id: string; title: string; msgs: Msg[] };
type Size = "compact" | "max";

// Floating MFP assistant: anchored bottom-right; drag its left/top edge to resize towards the left.
export function MfpButton() {
  const { session } = useAuth();
  const owner = session?.user.id ?? null;
  return <MfpSession key={owner ?? "guest"} owner={owner} />;
}

function MfpSession({ owner }: { owner: string | null }) {
  const history = useServerFn(mfpHistory);
  const [historyLoading, setHistoryLoading] = useState(!!owner);
  const [historyError, setHistoryError] = useState("");
  const active = useRef(true);
  const writes = useRef(Promise.resolve());
  const onExam = useRouterState({ select: (st) => st.location.pathname.startsWith("/exam") });
  const s = useSiteSettings();
  const chat = useServerFn(mfpChat);
  const createImage = useServerFn(mfpCreateImage);
  const [mode, setMode] = useState<"chat" | "image" | "document">("chat");
  const [attachmentError, setAttachmentError] = useState("");
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [size, setSize] = useState<Size>("compact");
  // h: 0 means "full viewport height" (the default); dragging sets a fixed height.
  const [dim, setDim] = useState({ w: 400, h: 0 });
  useEffect(() => {
    if (localStorage.getItem("mfp-size") === "max") setSize("max");
    try {
      const d = JSON.parse(localStorage.getItem("mfp-dim-v2") || "null");
      if (d && typeof d.w === "number" && typeof d.h === "number") setDim(d);
    } catch { /* ignore */ }
  }, []);
  function saveSize(v: Size) { setSize(v); localStorage.setItem("mfp-size", v); }
  const msgs = chats.find((c) => c.id === current)?.msgs ?? [];
  useEffect(() => {
    active.current = true;
    // Shared legacy browser history has no reliable owner. Never import it into an account.
    if (owner) {
      void history({ data: { action: "load" } }).then((saved) => {
        if (active.current) setChats(saved);
      }).catch(() => {
        if (active.current) setHistoryError("Saved chats could not load. You can still ask questions.");
      }).finally(() => { if (active.current) setHistoryLoading(false); });
    }
    return () => { active.current = false; };
  }, [owner]);
  function write(data: { action: "save"; chat: Chat } | { action: "delete"; id: string }) {
    if (!owner || !active.current) return;
    writes.current = writes.current.then(async () => {
      if (active.current) await history({ data });
    }).catch(() => {
      if (active.current) setHistoryError("Chat changes could not be saved. Please try again later.");
    });
  }
  function setMsgs(m: Msg[], id = current) {
    if (!active.current) return id ?? "";
    const cid = id ?? crypto.randomUUID();
    if (!id) setCurrent(cid);
    const first = m.find((x) => x.role === "user");
    const title = (first?.display ?? first?.content)?.slice(0, 40) || "New chat";
    const saved = { id: cid, title, msgs: m.slice(-200).map(({ image, ...msg }) => image ? { ...msg, content: `${msg.content} [photo]` } : msg) };
    write({ action: "save", chat: saved });
    setChats((prev) => {
      const next = prev.some((c) => c.id === cid)
        ? prev.map((c) => c.id === cid ? { id: cid, title, msgs: m } : c)
        : [{ id: cid, title, msgs: m }, ...prev];
      return next.slice(0, 50);
    });
    return cid;
  }
  function newChat() { voice.stop(); setCurrent(null); setShowList(false); setQuizSetup(null); }
  function deleteChat(id: string) {
    if (!confirm("Delete this chat?")) return;
    write({ action: "delete", id });
    setChats(chats.filter((c) => c.id !== id));
    if (id === current) setCurrent(null);
  }
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quizSetup, setQuizSetup] = useState<{ context: StudyContext | undefined } | null>(null);
  // Elapsed time appears only when a request takes longer than expected.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    const on = (e: Event) => { setOpen(true); setCurrent(null); setShowList(false); setQuizSetup(null); setInput((e as CustomEvent<string>).detail); };
    window.addEventListener(MFP_ASK, on);
    return () => window.removeEventListener(MFP_ASK, on);
  }, []);
  function pickImage(file: File) {
    setAttachmentError("");
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setAttachmentError("Choose a PNG, JPEG, WebP, or GIF photo.");
    if (file.size > 10_000_000) return setAttachmentError("Please choose a photo under 10 MB.");
    const reader = new FileReader();
    reader.onerror = () => setAttachmentError("The photo could not be read. Try again.");
    reader.onload = () => {
      const photo = new Image();
      photo.onerror = () => setAttachmentError("The photo could not be opened.");
      photo.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(photo.width, photo.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(photo.width * scale));
        canvas.height = Math.max(1, Math.round(photo.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return setAttachmentError("Photo processing is unavailable in this browser.");
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
        setImage(canvas.toDataURL("image/jpeg", 0.85));
      };
      photo.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  const voice = useMfpVoice(open && !onExam && s["mfp_enabled"] !== "false", text => setInput(prev => `${prev} ${text}`.trim().slice(0, 4000)));
  useEffect(() => { voice.stop(); }, [current]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  if (s["mfp_enabled"] === "false") return null;
  const quizFormat = msgs[0]?.quiz;
  const lastReply = msgs.length > 1 && msgs[msgs.length - 1]!.role === "assistant" ? msgs[msgs.length - 1]!.content : "";
  const answerOptions = quizFormat === "multiple-choice" && !busy && !msgs[0]?.content.startsWith("[MFP_PRACTICE_QUIZ") ? quizOptions(lastReply) : [];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim() || (image ? "Please look at this photo and help me." : "");
    await sendMessage(text);
  }

  function startStudy(action: StudyAction) {
    if (busy) return;
    setMode("chat");
    if (action === "quiz") { setShowList(false); setQuizSetup({ context: getStudyContext() }); return; }
    void sendMessage(buildStudyPrompt(action, getStudyContext()), "chat", null);
  }

  // Each quiz starts in a fresh chat so earlier conversations do not leak into it.
  function startQuiz(settings: QuizSettings) {
    setQuizSetup(null);
    void sendMessage(buildQuizPrompt(settings), "chat", null, quizLabel(settings), true, settings.format);
  }

  async function sendMessage(text: string, selectedMode = mode, attachment = image, display?: string, fresh = false, quiz?: QuizFormat) {
    if (!text || busy || historyLoading) return;
    const next: Msg[] = [...(fresh ? [] : msgs), { role: "user" as const, content: text, ...(display ? { display } : {}), ...(attachment ? { image: attachment } : {}), ...(quiz ? { quiz } : {}) }];
    const cid = setMsgs(next, fresh ? null : current);
    setQuizSetup(null);
    setInput(""); setImage(null);
    voice.stop();
    setBusy(true);
    try {
      const history = next.slice(-20).map((m, k, arr) => ({ role: m.role, content: m.content.slice(0, 19000) || " ", ...(m.image && k === arr.length - 1 ? { images: [m.image.split(",")[1]!] } : {}) }));
      if (selectedMode === "image") {
        const result = await createImage({ data: { prompt: text, ...(attachment ? { reference: attachment } : {}) } });
        setMsgs([...next, { role: "assistant", content: result.ok ? result.reply : result.error, ...(result.ok ? { image: result.image } : {}) }], cid);
        return;
      }
      if (selectedMode === "document") history[history.length - 1]!.content += "\n\nWrite a complete, polished standalone document for this request. Use a descriptive title, clear sections and tables when useful. Provide the actual document content, not instructions for creating it. The application offers PDF printing, Markdown and text downloads; do not claim to have attached a file. Verify changing factual claims using the supplied live evidence.";
      const res = await chat({ data: { messages: history, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      const content = res && typeof res === "object" && "ok" in res
        ? (res.ok ? String(res.reply) : String(res.error))
        : "The assistant could not answer. Please try again.";
      setMsgs([...next, { role: "assistant", content }], cid);
    } catch (err) {
      console.error("MFP chat failed", err);
      setMsgs([...next, { role: "assistant", content: mode === "image" ? "Image creation could not start. Make sure you are signed in, then try again." : "The assistant is busy right now. Please try again in a moment." }], cid);
    } finally {
      setBusy(false);
    }
  }

  function startResize(e: React.PointerEvent, mode: "w" | "h" | "wh") {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sw = dim.w, sh = dim.h || window.innerHeight - 20;
    const move = (ev: PointerEvent) => {
      const w = mode === "h" ? sw : Math.min(window.innerWidth - 32, Math.max(300, sw + (sx - ev.clientX)));
      const h = mode === "w" ? sh : Math.min(window.innerHeight - 32, Math.max(320, sh + (sy - ev.clientY)));
      setDim({ w, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDim((d) => { localStorage.setItem("mfp-dim-v2", JSON.stringify(d)); return d; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const isMax = size === "max";
  const box = isMax ? "inset-4 h-auto w-auto max-w-none" : "bottom-2.5 right-4 sm:right-6";
  if (onExam) return null;
  const boxStyle = isMax ? undefined : { width: `min(${dim.w}px, calc(100vw - 2rem))`, height: dim.h ? `min(${dim.h}px, calc(100dvh - 1.25rem))` : "calc(100dvh - 1.25rem)" };
  return (
    <>
      {open && (
        <div style={boxStyle} className={`fixed z-50 flex max-h-[calc(100dvh-1.25rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)] ${box}`}>
          {!isMax && (
            <>
              <div onPointerDown={(e) => startResize(e, "w")} title="Drag to resize" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize hover:bg-gold/40" />
              <div onPointerDown={(e) => startResize(e, "h")} title="Drag to resize" className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize hover:bg-gold/40" />
              <div onPointerDown={(e) => startResize(e, "wh")} title="Drag to resize" className="absolute left-0 top-0 z-20 h-4 w-4 cursor-nwse-resize rounded-br bg-gold/60" />
            </>
          )}
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide"><Sparkles className="h-4 w-4" />MFP Assistant</p>
            <div className="flex items-center gap-1">
              <button onClick={() => saveSize(size === "max" ? "compact" : "max")} aria-label={size === "max" ? "Restore" : "Maximize"} title={size === "max" ? "Restore" : "Full screen"} className="rounded-md p-1.5 hover:bg-primary-foreground/15">{size === "max" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
              <button onClick={newChat} aria-label="New chat" title="New chat" className="rounded-md p-1.5 hover:bg-primary-foreground/15"><Plus className="h-4 w-4" /></button>
              {owner && <button onClick={() => setShowList(!showList)} aria-label="My chats" title="My chats" className="rounded-md p-1.5 hover:bg-primary-foreground/15"><History className="h-4 w-4" /></button>}
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 hover:bg-primary-foreground/15"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="space-y-2 border-b border-border bg-muted/30 px-4 py-3">
            {voice.supported && !voice.speaking && <p className="text-xs text-muted-foreground">Answers appear as text. Choose Listen to answer to play audio.</p>}
            {!voice.supported && <p className="text-xs text-muted-foreground">Voice is unavailable in this browser. You can read and type.</p>}
            {voice.speaking && <div className="flex items-center gap-3 text-xs"><span role="status">{voice.paused ? "MFP paused" : "MFP is speaking…"}</span><button aria-label={voice.paused ? "Resume MFP" : "Pause MFP"} onClick={voice.togglePause} className="rounded border p-2">{voice.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button aria-label="Stop MFP" onClick={voice.stop} className="rounded border p-2"><Square className="h-4 w-4" /></button></div>}
            {!owner && <p className="text-xs text-muted-foreground">Sign in to save and view chat history. Guest chats disappear when you leave.</p>}
            {historyLoading && <p role="status" className="text-xs text-muted-foreground">Loading your saved chats…</p>}
            {historyError && <p role="alert" className="text-xs text-destructive">{historyError}</p>}
            {voice.error && <p role="alert" className="text-xs text-destructive">{voice.error}</p>}
          </div>
          {owner && showList && (
            <div className="max-h-56 space-y-1 overflow-y-auto border-b border-border bg-muted/40 p-2">
              <button onClick={newChat} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-bold text-primary hover:bg-accent"><Plus className="h-4 w-4" />New chat</button>
              {chats.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No saved chats yet.</p>}
              {chats.map((c) => (
                <div key={c.id} className={`flex items-center gap-1 rounded-md px-2 ${c.id === current ? "bg-accent" : "hover:bg-accent/60"}`}>
                  <button onClick={() => { setCurrent(c.id); setShowList(false); setQuizSetup(null); }} className="min-w-0 flex-1 truncate py-1.5 text-left text-sm font-semibold">{c.title}</button>
                  <button onClick={() => deleteChat(c.id)} aria-label="Delete chat" className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-4">
            {quizSetup && <MfpQuizSetup context={quizSetup.context} onStart={startQuiz} onCancel={() => setQuizSetup(null)} />}
            {!quizSetup && msgs.length === 0 && <p className="text-sm font-semibold text-muted-foreground">Ask about math, finance, news, science, or another topic. MFP checks the web for current information and explains when it cannot verify an answer.</p>}
            {!quizSetup && msgs.map((m, i) => (
              <div key={i} className={`group flex min-w-0 items-start gap-1 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={m.role === "user" ? "min-w-0 max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" : "min-w-0 max-w-[90%] rounded-2xl rounded-bl-sm border border-border/60 bg-muted/50 px-4 py-3 text-sm font-normal text-foreground"}>
                  {m.image && <img src={m.image} alt={m.role === "assistant" ? "Generated image" : "Your photo"} className="mb-2 max-h-80 rounded-lg" />}
                  {m.role === "assistant" ? <><div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary"><Sparkles aria-hidden="true" className="h-3 w-3" />MFP</div><MfpPracticeQuiz key={`${current}:${m.content}`} content={m.content} format={i === 1 ? msgs[0]?.quiz : undefined} disabled={busy || i !== msgs.length-1} onSubmit={answers=>sendMessage(answers)}/>
                    {m.image && <a href={m.image} download={`mfp-image.${m.image.startsWith("data:image/jpeg") ? "jpg" : m.image.startsWith("data:image/webp") ? "webp" : "png"}`} className="mt-2 inline-block rounded border border-border px-2 py-1 text-xs font-semibold">Download image</a>}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <button type="button" className="rounded border border-border px-2 py-1" onClick={(event) => {
                        const answer = event.currentTarget.closest(".group")?.querySelector<HTMLElement>(".mfp-message");
                        if (answer && !printAnswer(answer)) setAttachmentError("Allow pop-ups to open PDF print preview, then choose Save as PDF.");
                      }}>Save PDF</button>
                      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => downloadAnswer(m.content, "md")}>Markdown</button>
                      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => downloadAnswer(m.content, "txt")}>Text</button>
                    </div>{voice.supported && <button type="button" onClick={() => voice.speak(m.content)} className="mt-2 inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold"><Volume2 className="h-3.5 w-3.5" />Listen to answer</button>}</> : (m.display ?? m.content)}
                </div>
                <button onClick={() => setMsgs(msgs.filter((_, k) => k !== i))} aria-label="Delete message" title="Delete message"
                  className="mt-1 shrink-0 rounded p-1 text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {answerOptions.length > 0 && (
              <div role="group" aria-label="Answer options" className="grid gap-2">
                {answerOptions.map((o) => (
                  <button key={o.letter} type="button" onClick={() => void sendMessage(`My answer: ${o.letter}. ${o.text}`)} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary hover:bg-accent">
                    <span className="font-bold text-primary">{o.letter}.</span><span>{o.text}</span>
                  </button>
                ))}
              </div>
            )}
            {busy && (
              <div role="status" className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">
                  {mode === "image" ? "Creating your image…" : quizFormat ? (msgs.length <= 1 ? "MFP is writing your questions…" : "MFP is checking your answers…") : "MFP is thinking…"}
                  {elapsed >= 10 && <span className="font-normal"> Taking a little longer… ({elapsed}s)</span>}
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" /></div>
              </div>
            )}
            <div ref={end} />
          </div>
          <div role="group" aria-label="Study shortcuts" className="grid shrink-0 grid-cols-2 gap-2 border-t border-emerald-100 bg-emerald-50/40 px-3 py-3">
            {([{ action: "quiz", label: "Quiz Me", Icon: Zap }, { action: "plan", label: "Study Plan", Icon: CalendarDays }, { action: "coach", label: "AI Project Coach", Icon: Rocket }] as const).map(({ action, label, Icon }) => (
              <button key={action} type="button" disabled={busy} onClick={() => startStudy(action)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-semibold text-emerald-900 shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50">
                <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-700" />{label}
              </button>
            ))}
          </div>
          <div className="border-t border-border bg-muted/20 px-3 py-2">
            <div role="group" aria-label="Assistant mode" className="flex gap-1">
              {([['chat', 'Ask MFP'], ['image', 'Create image'], ['document', 'Write document']] as const).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${mode === value ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{label}</button>)}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{mode === "image" ? "Describe a photo or design. Sign in to create images. Download images before closing; they are not saved." : mode === "document" ? "Describe your document. Save PDF opens print preview: choose Save as PDF." : "Paste a copied photo with Ctrl+V or ⌘V. Web checks run when you ask."}</p>
          </div>
          {attachmentError && <p role="alert" className="px-3 py-2 text-xs text-destructive">{attachmentError}</p>}
          {image && (
            <div className="flex items-center gap-2 border-t border-border px-3 pt-3">
              <img src={image} alt="Photo to send" className="h-14 w-14 rounded-md object-cover" />
              <button type="button" onClick={() => setImage(null)} className="text-xs font-bold text-destructive">Remove photo</button>
            </div>
          )}
          {voice.listening && <p role="status" className="px-3 pt-2 text-xs text-primary">Listening… Your words appear below. Review them, then press Send.</p>}
          <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
            <label aria-label="Attach photo" title="Attach photo" className="cursor-pointer rounded-lg border border-border p-2.5 text-primary hover:bg-accent">
              <ImagePlus className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickImage(f); }} />
            </label>
            {voice.micSupported && <button type="button" disabled={busy} aria-label={voice.listening ? "Stop microphone" : "Speak your question"} aria-pressed={voice.listening} onClick={voice.microphone} className={`rounded-lg border border-border p-2.5 ${voice.listening ? "bg-primary text-primary-foreground" : "text-primary"}`}><Mic className="h-4 w-4" /></button>}
            <input aria-label="Your question" value={input} onChange={(e) => setInput(e.target.value)} onPaste={(event) => {
              const photo = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
              if (photo) { event.preventDefault(); pickImage(photo); }
            }} placeholder={mode === "image" ? "Describe your image…" : mode === "document" ? "Describe your document…" : quizFormat === "open-ended" ? "Type numbered answers: 1: …, 2: …" : quizFormat ? "Type numbered answers: 1: B, 2: A…" : "Type or paste a photo…"} maxLength={4000} className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring" />
            <button disabled={busy || historyLoading || (!input.trim() && !image)} aria-label="Send" className="rounded-lg bg-primary p-2.5 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open MFP assistant" className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary font-serif text-sm font-bold tracking-wide text-primary-foreground shadow-[var(--shadow-elegant)] transition hover:scale-105 sm:right-6">
          MFP
        </button>
      )}
    </>
  );
}
