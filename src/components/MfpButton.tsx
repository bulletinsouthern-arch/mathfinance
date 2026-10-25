import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Expand, History, ImagePlus, Maximize2, Minimize2, Move, Plus, Send, Shrink, Sparkles, Trash2, X } from "lucide-react";
import { MFP_ASK } from "@/lib/mfp-bus";
import { useSiteSettings } from "@/lib/settings";
import { mfpChat } from "@/lib/ai.functions";
import { toPlainText } from "@/lib/plain-text";

type Msg = { role: "user" | "assistant"; content: string; image?: string };
type Chat = { id: string; title: string; msgs: Msg[] };
const STORE = "mfp-chats";
type Size = "compact" | "max";

// Floating MFP assistant: anchored bottom-right; drag its left/top edge to resize towards the left.
export function MfpButton() {
  const s = useSiteSettings();
  const chat = useServerFn(mfpChat);
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [size, setSize] = useState<Size>("compact");
  const [dim, setDim] = useState({ w: 400, h: 520 });
  useEffect(() => {
    if (localStorage.getItem("mfp-size") === "max") setSize("max");
    try {
      const d = JSON.parse(localStorage.getItem("mfp-dim") || "null");
      if (d && typeof d.w === "number" && typeof d.h === "number") setDim(d);
    } catch { /* ignore */ }
  }, []);
  function saveSize(v: Size) { setSize(v); localStorage.setItem("mfp-size", v); }
  const msgs = chats.find((c) => c.id === current)?.msgs ?? [];
  useEffect(() => {
    try { setChats(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch { /* ignore */ }
  }, []);
  const strip = (l: Chat[]) => l.slice(0, 50).map((c) => ({ ...c, msgs: c.msgs.map(({ image, ...m }) => (image ? { ...m, content: `${m.content} [photo]` } : m)) }));
  function persist(next: Chat[]) { setChats(next); localStorage.setItem(STORE, JSON.stringify(strip(next))); }
  function setMsgs(m: Msg[], id = current) {
    const cid = id ?? crypto.randomUUID();
    if (!id) setCurrent(cid);
    setChats((prev) => {
      const exists = prev.some((c) => c.id === cid);
      const title = m.find((x) => x.role === "user")?.content.slice(0, 40) || "New chat";
      const next = exists ? prev.map((c) => (c.id === cid ? { ...c, msgs: m, title } : c)) : [{ id: cid, title, msgs: m }, ...prev];
      localStorage.setItem(STORE, JSON.stringify(strip(next)));
      return next;
    });
    return cid;
  }
  function newChat() { setCurrent(null); setShowList(false); }
  function deleteChat(id: string) {
    if (!confirm("Delete this chat?")) return;
    persist(chats.filter((c) => c.id !== id));
    if (id === current) setCurrent(null);
  }
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { setOpen(true); setCurrent(null); setShowList(false); setInput((e as CustomEvent<string>).detail); };
    window.addEventListener(MFP_ASK, on);
    return () => window.removeEventListener(MFP_ASK, on);
  }, []);
  function pickImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 4_000_000) return void alert("Please choose a photo under 4 MB.");
    const r = new FileReader();
    r.onload = () => setImage(String(r.result));
    r.readAsDataURL(file);
  }
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  if (s["mfp_enabled"] === "false") return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim() || (image ? "Please look at this photo and help me." : "");
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user" as const, content: text, ...(image ? { image } : {}) }];
    const cid = setMsgs(next);
    setInput(""); setImage(null);
    setBusy(true);
    try {
      const history = next.slice(-20).map((m, k, arr) => ({ role: m.role, content: m.content.slice(0, 19000) || " ", ...(m.image && k === arr.length - 1 ? { images: [m.image.split(",")[1]!] } : {}) }));
      const res = await chat({ data: { messages: history } });
      const content = res && typeof res === "object" && "ok" in res
        ? (res.ok ? String(res.reply) : String(res.error))
        : "The assistant could not answer. Please try again.";
      setMsgs([...next, { role: "assistant", content }], cid);
    } catch (err) {
      console.error("MFP chat failed", err);
      setMsgs([...next, { role: "assistant", content: "The assistant is busy right now. Please try again in a moment." }], cid);
    } finally {
      setBusy(false);
    }
  }

  function startResize(e: React.PointerEvent, mode: "w" | "h" | "wh") {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sw = dim.w, sh = dim.h;
    const move = (ev: PointerEvent) => {
      const w = mode === "h" ? sw : Math.min(window.innerWidth - 32, Math.max(300, sw + (sx - ev.clientX)));
      const h = mode === "w" ? sh : Math.min(window.innerHeight - 120, Math.max(320, sh + (sy - ev.clientY)));
      setDim({ w, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDim((d) => { localStorage.setItem("mfp-dim", JSON.stringify(d)); return d; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const isMax = size === "max";
  const box = isMax ? "inset-4 h-auto w-auto max-w-none" : "bottom-24 right-4 sm:right-6";
  const boxStyle = isMax ? undefined : { width: `min(${dim.w}px, calc(100vw - 2rem))`, height: `min(${dim.h}px, calc(100vh - 8rem))` };
  return (
    <>
      {open && (
        <div style={boxStyle} className={`fixed z-50 flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)] ${box}`}>
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
              <button onClick={() => setShowList(!showList)} aria-label="My chats" title="My chats" className="rounded-md p-1.5 hover:bg-primary-foreground/15"><History className="h-4 w-4" /></button>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 hover:bg-primary-foreground/15"><X className="h-4 w-4" /></button>
            </div>
          </div>
          {showList && (
            <div className="max-h-56 space-y-1 overflow-y-auto border-b border-border bg-muted/40 p-2">
              <button onClick={newChat} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-bold text-primary hover:bg-accent"><Plus className="h-4 w-4" />New chat</button>
              {chats.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No saved chats yet.</p>}
              {chats.map((c) => (
                <div key={c.id} className={`flex items-center gap-1 rounded-md px-2 ${c.id === current ? "bg-accent" : "hover:bg-accent/60"}`}>
                  <button onClick={() => { setCurrent(c.id); setShowList(false); }} className="min-w-0 flex-1 truncate py-1.5 text-left text-sm font-semibold">{c.title}</button>
                  <button onClick={() => deleteChat(c.id)} aria-label="Delete chat" className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && <p className="text-sm font-semibold text-muted-foreground">Ask any business math or finance question.</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`group flex items-start gap-1 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={m.role === "user" ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm font-medium text-foreground"}>
                  {m.image && <img src={m.image} alt="Your photo" className="mb-2 max-h-40 rounded-lg" />}
                  {m.role === "assistant" ? toPlainText(m.content) : m.content}
                </div>
                <button onClick={() => setMsgs(msgs.filter((_, k) => k !== i))} aria-label="Delete message" title="Delete message"
                  className="mt-1 rounded p-1 text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {busy && <p className="text-xs font-bold text-muted-foreground">MFP is thinking…</p>}
            <div ref={end} />
          </div>
          {image && (
            <div className="flex items-center gap-2 border-t border-border px-3 pt-3">
              <img src={image} alt="Photo to send" className="h-14 w-14 rounded-md object-cover" />
              <button type="button" onClick={() => setImage(null)} className="text-xs font-bold text-destructive">Remove photo</button>
            </div>
          )}
          <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
            <label aria-label="Attach photo" title="Attach photo" className="cursor-pointer rounded-lg border border-border p-2.5 text-primary hover:bg-accent">
              <ImagePlus className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickImage(f); }} />
            </label>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" maxLength={4000} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring" />
            <button disabled={busy || (!input.trim() && !image)} aria-label="Send" className="rounded-lg bg-primary p-2.5 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-label="Open MFP assistant" className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary font-serif text-sm font-bold tracking-wide text-primary-foreground shadow-[var(--shadow-elegant)] transition hover:scale-105 sm:right-6">
        {open ? <X className="h-5 w-5" /> : "MFP"}
      </button>
    </>
  );
}
