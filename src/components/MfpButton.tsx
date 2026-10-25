import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles, X } from "lucide-react";
import { useSiteSettings } from "@/lib/settings";
import { mfpChat } from "@/lib/ai.functions";

type Msg = { role: "user" | "assistant"; content: string };

// Floating MFP assistant: small round button opening a compact AI chat.
export function MfpButton() {
  const s = useSiteSettings();
  const chat = useServerFn(mfpChat);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);
  if (s["mfp_enabled"] === "false") return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    const res = await chat({ data: { messages: next.slice(-20) } }).catch(() => ({ ok: false as const, error: "Could not reach the assistant." }));
    setMsgs([...next, { role: "assistant", content: res.ok ? res.reply : res.error }]);
    setBusy(false);
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[520px] w-[92vw] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)] sm:right-6">
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide"><Sparkles className="h-4 w-4" />MFP Assistant</p>
            <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 hover:bg-primary-foreground/15"><X className="h-4 w-4" /></button>
          </div>
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
