import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Volume2, VolumeX, RefreshCw, Video, Send } from "lucide-react";
import { IntegrityReviews } from "./IntegrityReviews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { liveExamPoll, liveExamVision, liveExamRemove } from "@/lib/proctor.functions";
import { createExamPeer, createIceQueue, sendExamSignal } from "@/lib/proctor-media";
type Room = Awaited<ReturnType<typeof liveExamPoll>>["rooms"][number];
type Peer = {
  pc: RTCPeerConnection;
  connection: string;
  userId: string;
  ice: ReturnType<typeof createIceQueue>;
  audio: RTCRtpSender;
  stream: MediaStream;
  created: number;
};

export function ProctorLive() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [states, setStates] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const peers = useRef(new Map<string, Peer>());
  const microphone = useRef<MediaStream | null>(null);
  const [talking, setTalking] = useState<string | null>(null);
  const talkingRef = useRef<string | null>(null);
  const [listening, setListening] = useState<string | null>(null);
  const [vision, setVision] = useState(true);
  const active = useRef(true);
  const talkPending = useRef(false);
  const stopTalk = () => {
    microphone.current?.getAudioTracks().forEach((t) => (t.enabled = false));
    talkingRef.current = null;
    setTalking(null);
  };
  function drop(id: string) {
    const peer = peers.current.get(id);
    peer?.pc.close();
    peers.current.delete(id);
    if (talkingRef.current === id) stopTalk();
    setStreams((old) => {
      const next = { ...old };
      delete next[id];
      return next;
    });
  }
  async function connect(room: Room) {
    drop(room.attemptId);
    const pc = createExamPeer();
    const peer: Peer = {
      pc,
      connection: crypto.randomUUID(),
      userId: room.userId,
      ice: createIceQueue(pc),
      audio: pc.addTransceiver("audio", { direction: "sendrecv" }).sender,
      stream: new MediaStream(),
      created: Date.now(),
    };
    pc.addTransceiver("video", { direction: "recvonly" });
    peers.current.set(room.attemptId, peer);
    setStates((old) => ({ ...old, [room.attemptId]: "Connecting…" }));
    pc.ontrack = (e) => {
      peer.stream.addTrack(e.track);
      setStreams((old) => ({ ...old, [room.attemptId]: peer.stream }));
    };
    pc.onconnectionstatechange = () => {
      if (active.current && peers.current.get(room.attemptId) === peer)
        setStates((old) => ({ ...old, [room.attemptId]: pc.connectionState }));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate)
        void sendExamSignal({
          attemptId: room.attemptId,
          to: room.userId,
          body: { type: "ice", connection: peer.connection, ice: e.candidate.toJSON() },
        }).catch(() => {});
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendExamSignal({
        attemptId: room.attemptId,
        to: room.userId,
        body: { type: "offer", connection: peer.connection, sdp: offer.sdp! },
      });
    } catch {
      pc.close();
      setStates((old) => ({ ...old, [room.attemptId]: "Connection failed. Press reconnect." }));
    }
  }
  useEffect(() => {
    active.current = true;
    let stopped = false,
      after = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const response = await liveExamPoll({ data: { after } });
        if (stopped) return;
        setError(false);
        setRooms(response.rooms);
        const ids = new Set(response.rooms.map((r) => r.attemptId));
        for (const id of peers.current.keys()) if (!ids.has(id)) drop(id);
        for (const room of response.rooms) {
          const existing = peers.current.get(room.attemptId);
          if (
            !existing ||
            (["failed", "disconnected", "new", "connecting"].includes(
              existing.pc.connectionState,
            ) &&
              Date.now() - existing.created > 20000)
          )
            void connect(room);
        }
        for (const signal of response.signals) {
          after = Math.max(after, signal.id);
          const p = peers.current.get(signal.attemptId);
          if (!p || p.connection !== signal.body.connection || p.userId !== signal.from) continue;
          try {
            if (
              signal.body.type === "answer" &&
              signal.body.sdp &&
              p.pc.signalingState === "have-local-offer"
            ) {
              await p.pc.setRemoteDescription({ type: "answer", sdp: signal.body.sdp });
              await p.ice.flush();
            }
            if (signal.body.type === "ice" && signal.body.ice) await p.ice.add(signal.body.ice);
          } catch {
            setStates((old) => ({
              ...old,
              [signal.attemptId]: "Connection interrupted. Press reconnect.",
            }));
          }
        }
      } catch {
        if (!stopped) setError(true);
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 1000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      active.current = false;
      clearTimeout(timer);
      for (const p of peers.current.values()) p.pc.close();
      peers.current.clear();
      microphone.current?.getTracks().forEach((t) => t.stop());
      microphone.current = null;
    };
    // This loop owns the connections for the lifetime of the administrator room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function talk(room: Room) {
    if (talkPending.current) return;
    if (talkingRef.current === room.attemptId) {
      stopTalk();
      return;
    }
    stopTalk();
    talkPending.current = true;
    try {
      if (!microphone.current || microphone.current.getAudioTracks()[0]?.readyState !== "live")
        microphone.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      if (!active.current) {
        microphone.current?.getTracks().forEach((t) => t.stop());
        microphone.current = null;
        return;
      }
      const peer = peers.current.get(room.attemptId);
      if (!peer || peer.pc.connectionState !== "connected") {
        stopTalk();
        toast.error("Connect the student video before talking.");
        return;
      }
      // Detach from every other student before enabling the shared microphone track.
      await Promise.all([...peers.current.values()].map((p) => p.audio.replaceTrack(null)));
      const track = microphone.current.getAudioTracks()[0]!;
      await peer.audio.replaceTrack(track);
      track.enabled = true;
      talkingRef.current = room.attemptId;
      setTalking(room.attemptId);
      setListening(room.attemptId);
    } catch {
      stopTalk();
      toast.error("Allow microphone access to talk to the student.");
    } finally {
      talkPending.current = false;
    }
  }
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Video className="h-5 w-5" />
          Live exam room
        </h2>
        <p className="text-sm text-muted-foreground">
          Live video connects automatically. Listen to hear a student; Talk enables your microphone
          for that student only. Students cannot see or hear each other. Only authorized
          administrators can open these feeds. Media is not recorded.
        </p>
        <p className="text-sm text-muted-foreground">
          More than 20 seconds away from the exam window triggers a 14-day assessment suspension.
          Consecutive confident checks showing nobody in camera view for over 20 seconds suspend access. Head turns are allowed. Students receive text and spoken reminders and can appeal to resume.
        </p>
        <Button variant={vision ? "secondary" : "outline"} onClick={() => setVision((v) => !v)}>
          {vision ? "Stop dashboard samples" : "Start dashboard samples"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Visual checks send camera samples to your configured Ollama service. An image-capable
          model is required. Estimates describe head position, not thinking, attention or cheating.
          Connection quality depends on both networks; some restrictive networks prevent direct
          video connections.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Monitoring connection interrupted. Reconnecting…
          </p>
        )}
      </div>
      {!rooms.length && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No active students are connected.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => (
          <StudentFeed
            key={room.attemptId}
            room={room}
            stream={streams[room.attemptId]}
            state={states[room.attemptId] ?? "Connecting…"}
            listening={listening === room.attemptId}
            talking={talking === room.attemptId}
            vision={vision}
            onListen={() => setListening(listening === room.attemptId ? null : room.attemptId)}
            onTalk={() => void talk(room)}
            onReconnect={() => void connect(room)}
          />
        ))}
      </div>
      <IntegrityReviews />
    </section>
  );
}
function StudentFeed({
  room,
  stream,
  state,
  listening,
  talking,
  vision,
  onListen,
  onTalk,
  onReconnect,
}: {
  room: Room;
  stream: MediaStream | undefined;
  state: string;
  listening: boolean;
  talking: boolean;
  vision: boolean;
  onListen: () => void;
  onTalk: () => void;
  onReconnect: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("");
  const [visual, setVisual] = useState("Visual checks off");
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [amount, setAmount] = useState(14);
  const [unit, setUnit] = useState<"hours" | "days" | "weeks">("days");
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(false);
  async function remove() {
    setRemoving(true);
    try {
      await liveExamRemove({ data: { attemptId: room.attemptId, amount, unit, reason } });
      toast.success(amount ? "Student removed and assessment access suspended" : "Student removed");
    } catch {
      toast.error("Could not remove student. Please retry.");
    } finally {
      setRemoving(false);
    }
  }
  useEffect(() => {
    if (video.current) {
      video.current.srcObject = stream ?? null;
      void video.current.play().catch(() => setSoundBlocked(true));
    }
  }, [stream, listening]);
  useEffect(() => {
    if (!vision || !stream) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    let lastFrame = -1;
    async function sample() {
      try {
        const v = video.current;
        const frame = v?.getVideoPlaybackQuality?.().totalVideoFrames ?? v?.currentTime ?? -1;
        if (v && v.readyState >= 2 && !v.paused && v.videoWidth > 0 && frame > lastFrame) {
          lastFrame = frame;
          canvas.getContext("2d")?.drawImage(v, 0, 0, 320, 240);
          const response = await liveExamVision({
            data: {
              attemptId: room.attemptId,
              image: canvas.toDataURL("image/jpeg", 0.65).split(",")[1]!,
            },
          });
          if (!stopped) setVisual(response.message);
        } else if (!stopped) setVisual("Waiting for live camera.");
      } catch {
        if (!stopped) setVisual("Automatic checks unavailable; use live preview.");
      } finally {
        if (!stopped) timer = setTimeout(() => void sample(), 4000);
      }
    }
    void sample();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [vision, stream, room.attemptId]);
  async function warn() {
    if (!message.trim()) return;
    try {
      await sendExamSignal({
        attemptId: room.attemptId,
        to: room.userId,
        body: { type: "warn", connection: crypto.randomUUID(), text: message.trim() },
      });
      setMessage("");
      toast.success("Message sent");
    } catch {
      toast.error("Could not send message.");
    }
  }
  return (
    <article
      className={`space-y-3 rounded-xl border p-3 ${room.focused ? "border-border" : "border-destructive"}`}
    >
      <video
        ref={video}
        autoPlay
        playsInline
        muted={!listening}
        aria-label={`Live camera: ${room.name}`}
        style={{ transform: "none" }}
        className="aspect-[4/3] w-full rounded-lg bg-black object-contain"
      />
      <p className="font-bold">{room.name}</p>
      <p className="text-xs text-muted-foreground">Live camera</p>
      <p className="text-xs text-muted-foreground">
        {state} · {room.answered}/{room.total} answered · {room.warnings}/3 warnings
      </p>
      <p className="text-xs">
        {room.focused
          ? "On exam window"
          : `Away since ${room.awaySince ? new Date(room.awaySince).toLocaleTimeString() : "just now"}`}{" "}
        · {room.mic ? "Microphone on" : "Microphone interrupted"} ·{" "}
        {room.fullscreen ? "Fullscreen" : "Left fullscreen"}
      </p>
      {room.suspended && (
        <p role="alert" className="text-sm text-destructive">
          Automatically suspended for 14 days.
        </p>
      )}
      {room.visualFlagged && (
        <p className="text-sm text-amber-600">Visual observation needs review.</p>
      )}
      {vision && <p className="text-xs text-muted-foreground">{visual}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onListen}>
          {listening ? <VolumeX className="mr-1 h-4 w-4" /> : <Volume2 className="mr-1 h-4 w-4" />}
          {listening ? "Stop listening" : "Listen"}
        </Button>
        <Button size="sm" variant={talking ? "default" : "outline"} onClick={onTalk}>
          {talking ? <MicOff className="mr-1 h-4 w-4" /> : <Mic className="mr-1 h-4 w-4" />}
          {talking ? "Mute my mic" : "Talk"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onReconnect}
          aria-label={`Reconnect ${room.name}`}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {soundBlocked && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void video.current
              ?.play()
              .then(() => setSoundBlocked(false))
              .catch(() =>
                toast.error("Browser blocked sound. Allow audio playback for this site."),
              )
          }
        >
          Enable audio playback
        </Button>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={`Message to ${room.name}`}
          placeholder="Message student…"
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button variant="outline" size="icon" aria-label="Send message" onClick={() => void warn()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2 border-t pt-3">
        <Input
          aria-label={`Removal reason for ${room.name}`}
          placeholder="Reason for removal or suspension…"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={`Suspension amount for ${room.name}`}
            className="w-20"
            type="number"
            min="0"
            max="365"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <select
            aria-label={`Suspension unit for ${room.name}`}
            className="rounded-md border bg-background px-2 text-sm"
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="weeks">weeks</option>
          </select>
          <Button
            variant="destructive"
            size="sm"
            disabled={
              removing || !reason.trim() || !Number.isInteger(amount) || amount < 0 || amount > 365
            }
            onClick={() => void remove()}
          >
            {removing ? "Saving…" : amount ? "Remove & suspend" : "Remove"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Set duration to 0 to remove without suspending.
        </p>
      </div>
    </article>
  );
}
