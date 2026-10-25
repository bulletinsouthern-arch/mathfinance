import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { History, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { useSiteSettings } from "@/lib/settings";
import { mfpChat } from "@/lib/ai.functions";

type Msg = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; msgs: Msg[] };
const STORE = "mfp-chats";

// Floating MFP assistant: small round button opening a compact AI chat.
export function MfpButton() {
  const s = useSiteSettings();
  const chat = useServerFn(mfpChat);
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const msgs = chats.find((c) => c.id === current)?.msgs ?? [];
  useEffect(() => {
    try { setChats(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch { /* ignore */ }
  }, []);
  function persist(next: Chat[]) { setChats(next); localStorage.setItem(STORE, JSON.stringify(next.slice(0, 50))); }
  function setMsgs(m: Msg[], id = current) {
    const cid = id ?? crypto.randomUUID();
    if (!id) setCurrent(cid);
    setChats((prev) => {
      const exists = prev.some((c) => c.id === cid);
      const title = m.find((x) => x.role === "user")?.content.slice(0, 40) || "New chat";
      const next = exists ? prev.map((c) => (c.id === cid ? { ...c, msgs: m, title } : c)) : [{ id: cid, title, msgs: m }, ...prev];
      localStorage.setItem(STORE, JSON.stringify(next.slice(0, 50)));
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
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  if (s["mfp_enabled"] === "false") return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    const cid = setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const history = next.slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 19000) || " " }));
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

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[520px] w-[92vw] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)] sm:right-6">
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide"><Sparkles className="h-4 w-4" />MFP Assistant</p>
            <div className="flex items-center gap-1">
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
              <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm font-medium text-foreground"}>
                {m.content}
              </div>
            ))}
            {busy && <p className="text-xs font-bold text-muted-foreground">MFP is thinking…</p>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" maxLength={4000} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring" />
            <button disabled={busy || !input.trim()} aria-label="Send" className="rounded-lg bg-primary p-2.5 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-label="Open MFP assistant" className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary font-serif text-sm font-bold tracking-wide text-primary-foreground shadow-[var(--shadow-elegant)] transition hover:scale-105 sm:right-6">
        {open ? <X className="h-5 w-5" /> : "MFP"}
      </button>
    </>
  );
}
