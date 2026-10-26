import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Mic, MicOff, Phone, PhoneOff, Send, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Live = { userId: string; name: string; exam?: string; frame: string; warnings: number; fullscreen: boolean; focused: boolean; mic?: boolean; answered: number; total: number; at: number };
type Chan = ReturnType<typeof supabase.channel>;

const QUICK = [
  "Please take off your glasses and show them to the camera.",
  "Please show your desk and both hands to the camera.",
  "Please remove your earphones or earbuds.",
  "Please slowly turn your camera around the room.",
  "Stay in full screen and do not switch tabs.",
];

// Live-only proctoring: nothing here is recorded or saved.
export function ProctorLive() {
  const [live, setLive] = useState<Record<string, Live>>({});
  const ch = useRef<Chan | null>(null);
  const [callWith, setCallWith] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const c = supabase.channel("proctor-live");
    c.on("broadcast", { event: "frame" }, ({ payload }) => setLive((l) => ({ ...l, [(payload as Live).userId]: payload as Live })));
    c.on("broadcast", { event: "leave" }, ({ payload }) => setLive((l) => { const n = { ...l }; delete n[(payload as { userId: string }).userId]; return n; }));
    c.on("broadcast", { event: "student" }, async ({ payload }) => {
      const p = payload as { from: string; type: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
      if (!pc.current) return;
      if (p.type === "answer" && p.sdp) await pc.current.setRemoteDescription(p.sdp);
      if (p.type === "ice" && p.ice) { try { await pc.current.addIceCandidate(p.ice); } catch { /* ignore */ } }
    });
    c.subscribe();
    ch.current = c;
    const sweep = setInterval(() => setLive((l) => Object.fromEntries(Object.entries(l).filter(([, v]) => Date.now() - v.at < 10000))), 4000);
    return () => { clearInterval(sweep); endCall(); void supabase.removeChannel(c); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (to: string, type: string, extra: Record<string, unknown> = {}) =>
    void ch.current?.send({ type: "broadcast", event: "admin", payload: { to, type, ...extra } });

  function endCall() {
    if (callWith) send(callWith, "hangup");
    pc.current?.close(); pc.current = null;
    mic.current?.getTracks().forEach((t) => t.stop()); mic.current = null;
    setCallWith(null);
  }

  async function call(to: string) {
    endCall();
    try {
      mic.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
    } catch { toast.error("Allow your microphone to talk to the student."); return; }
    const p = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.current = p;
    mic.current.getTracks().forEach((t) => p.addTrack(t, mic.current!));
    p.addTransceiver("video", { direction: "recvonly" });
    p.ontrack = (e) => { if (remoteVideo.current) { remoteVideo.current.srcObject = e.streams[0] ?? null; void remoteVideo.current.play().catch(() => {}); } };
    p.onicecandidate = (e) => { if (e.candidate) send(to, "ice", { ice: e.candidate.toJSON() }); };
    const offer = await p.createOffer();
    await p.setLocalDescription(offer);
    send(to, "offer", { sdp: offer });
    setMuted(false);
    setCallWith(to);
  }

  function toggleMute() {
    const m = !muted;
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !m));
    setMuted(m);
  }

  function warn(to: string, text: string) {
    if (!text.trim()) return;
    send(to, "warn", { text: text.trim() });
    toast.success("Warning sent");
  }

  async function kick(s: Live, amount: number, unit: "hours" | "days" | "weeks", reason: string) {
    const ms = amount * (unit === "hours" ? 3600e3 : unit === "days" ? 86400e3 : 7 * 86400e3);
    if (amount > 0) {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("exam_bans").insert({ user_id: s.userId, until: new Date(Date.now() + ms).toISOString(), reason, created_by: u.user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    if (callWith === s.userId) endCall();
    send(s.userId, "kick", { text: reason });
    toast.success(amount > 0 ? `${s.name} removed and suspended for ${amount} ${unit}` : `${s.name} removed from the exam`);
  }

  const list = Object.values(live);
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-sans text-lg font-bold"><Video className="h-5 w-5 text-primary" />Live exam room</h2>
        <p className="mt-1 text-sm text-muted-foreground">Students taking a quiz or exam appear here with their live camera. Press <b>Call</b> to see and hear them and talk to them; only you can see them. Nothing is recorded.</p>
      </div>

      {callWith && (
        <div className="rounded-2xl border-2 border-primary bg-card p-4">
          <p className="mb-2 text-sm font-bold">On a call with {live[callWith]?.name ?? "student"}</p>
          <video ref={remoteVideo} autoPlay playsInline className="aspect-video w-full max-w-xl rounded-lg bg-muted object-contain" />
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={toggleMute}>{muted ? <><MicOff className="mr-2 h-4 w-4" />Unmute</> : <><Mic className="mr-2 h-4 w-4" />Mute me</>}</Button>
            <Button variant="destructive" onClick={endCall}><PhoneOff className="mr-2 h-4 w-4" />End call</Button>
          </div>
        </div>
      )}
      {!callWith && <video ref={remoteVideo} className="hidden" />}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No one is taking an exam right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => <StudentCard key={s.userId} s={s} inCall={callWith === s.userId} onCall={() => void call(s.userId)} onWarn={(t) => warn(s.userId, t)} onKick={(a, u, r) => void kick(s, a, u, r)} />)}
        </div>
      )}
    </section>
  );
}

function StudentCard({ s, inCall, onCall, onWarn, onKick }: { s: Live; inCall: boolean; onCall: () => void; onWarn: (t: string) => void; onKick: (a: number, u: "hours" | "days" | "weeks", r: string) => void }) {
  const [msg, setMsg] = useState("");
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<"hours" | "days" | "weeks">("days");
  const bad = !s.fullscreen || !s.focused || s.mic === false;
  return (
    <div className={`space-y-3 rounded-2xl border bg-card p-3 ${bad ? "border-destructive" : "border-border"}`}>
      {s.frame ? <img src={s.frame} alt={`Live camera of ${s.name}`} className="aspect-[4/3] w-full rounded-lg bg-muted object-cover" /> : <div className="aspect-[4/3] w-full rounded-lg bg-muted" />}
      <div>
        <p className="truncate text-sm font-bold">{s.name}</p>
        <p className="truncate text-xs text-muted-foreground">{s.exam} · {s.answered}/{s.total} answered</p>
        <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-bold">
          <span className={`rounded-full px-2 py-0.5 ${s.warnings ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{s.warnings} warnings</span>
          <span className={`rounded-full px-2 py-0.5 ${s.fullscreen ? "bg-accent" : "bg-destructive/10 text-destructive"}`}>{s.fullscreen ? "Full screen" : "Left full screen"}</span>
          <span className={`rounded-full px-2 py-0.5 ${s.mic === false ? "bg-destructive/10 text-destructive" : "bg-accent"}`}>{s.mic === false ? "Mic OFF" : "Mic on"}</span>
          <span className={`rounded-full px-2 py-0.5 ${s.focused ? "bg-accent" : "bg-destructive/10 text-destructive"}`}>{s.focused ? "On exam tab" : "Other tab / app"}</span>
        </div>
      </div>
      <Button size="sm" className="w-full" variant={inCall ? "secondary" : "default"} onClick={onCall} disabled={inCall}><Phone className="mr-2 h-4 w-4" />{inCall ? "In call" : "Call (see & hear)"}</Button>
      <select aria-label="Quick check" className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs" value="" onChange={(e) => e.target.value && onWarn(e.target.value)}>
        <option value="">Quick check / warning…</option>
        {QUICK.map((q) => <option key={q} value={q}>{q}</option>)}
      </select>
      <div className="flex gap-2">
        <Input className="h-9 text-xs" placeholder="Write a warning…" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => { onWarn(msg); setMsg(""); }} aria-label="Send warning"><Send className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center gap-2">
        <Input aria-label="Suspend amount" className="h-9 w-16 text-xs" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select aria-label="Suspend unit" className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
          <option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option>
        </select>
        <Button size="sm" variant="destructive" onClick={() => { const r = prompt("Reason (shown to the student):", "Cheating suspected") ?? ""; if (confirm(`Remove ${s.name}${Number(amount) > 0 ? ` and suspend for ${amount} ${unit}` : ""}?`)) onKick(Math.max(0, Number(amount) || 0), unit, r); }}>
          <Ban className="mr-1 h-4 w-4" />Kick
        </Button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><AlertTriangle className="h-3 w-3" />Set 0 to remove without suspending.</p>
    </div>
  );
}
