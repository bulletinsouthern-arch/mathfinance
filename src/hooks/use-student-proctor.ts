import { useEffect, useRef } from "react";
import { liveExamVision, liveExamPoll } from "@/lib/proctor.functions";
import { createExamPeer, createIceQueue, sendExamSignal } from "@/lib/proctor-media";
type Options = {
  active: boolean;
  attemptId: string | null;
  stream: MediaStream | null;
  answered: number;
  total: number;
  onMessage: (message: string) => void;
  onSuspend: () => void;
  onKick: (reason: string) => void;
  onCall: (active: boolean) => void;
  onWarning?: (since: string|null) => void;
};
export function useStudentProctor(options: Options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    if (!options.active || !options.attemptId) return;
    const attemptId = options.attemptId;
    let stopped = false,
      after = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    let peer: RTCPeerConnection | null = null,
      queue: ReturnType<typeof createIceQueue> | null = null;
    let connection = "",
      admin = "",
      audio: HTMLAudioElement | null = null;
    const earlyIce = new Map<string, RTCIceCandidateInit[]>();
    let running = false,
      again = false;
    const hang = () => {
      peer?.close();
      peer = null;
      queue = null;
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
      audio = null;
      if (!stopped) current.current.onCall(false);
    };
    const state = () => ({
      focused: document.hasFocus() && !document.hidden,
      fullscreen: !!document.fullscreenElement,
      mic: !!current.current.stream
        ?.getAudioTracks()
        .some((t) => t.readyState === "live" && t.enabled && !t.muted),
      answered: current.current.answered,
      total: current.current.total,
    });
    async function poll() {
      if (stopped) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        const response = await liveExamPoll({ data: { attemptId, after, ...state() } });
        if (stopped) return;
        if (response.rooms[0]?.suspended) {
          current.current.onSuspend();
          return;
        }
        if (response.rooms[0]?.removed) {
          current.current.onKick("The proctor ended your attempt.");
          return;
        }
        const room = response.rooms[0];
        const since = [room?.awaySince,room?.visionAwaySince].filter(Boolean).sort()[0] ?? null;
        current.current.onWarning?.(since);
        for (const signal of response.signals) {
          after = Math.max(after, signal.id);
          if (signal.attemptId !== attemptId) continue;
          const body = signal.body;
          if (body.type === "warn") {
            current.current.onMessage("Message from proctor: " + body.text);
            continue;
          }
          if (body.type === "kick") {
            current.current.onKick(body.text ?? "");
            continue;
          }
          if (body.type === "offer" && body.sdp) {
            hang();
            connection = body.connection;
            admin = signal.from;
            const p = createExamPeer();
            peer = p;
            queue = createIceQueue(p);
            current.current.stream
              ?.getTracks()
              .forEach((t) => p.addTrack(t, current.current.stream!));
            p.ontrack = (e) => {
              if (!audio) {
                audio = new Audio();
                audio.autoplay = true;
              }
              audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
              void audio
                .play()
                .catch(() =>
                  current.current.onMessage("Tap “Enable proctor sound” to hear your proctor."),
                );
            };
            p.onicecandidate = (e) => {
              if (e.candidate)
                void sendExamSignal({
                  attemptId,
                  to: admin,
                  body: { type: "ice", connection, ice: e.candidate.toJSON() },
                }).catch(() => {});
            };
            p.onconnectionstatechange = () => {
              if (p.connectionState === "connected") current.current.onCall(true);
              if (["failed", "disconnected"].includes(p.connectionState))
                current.current.onCall(false);
            };
            await p.setRemoteDescription({ type: "offer", sdp: body.sdp });
            for (const ice of earlyIce.get(connection) ?? []) await queue.add(ice);
            earlyIce.clear();
            await queue.flush();
            const answer = await p.createAnswer();
            await p.setLocalDescription(answer);
            await sendExamSignal({
              attemptId,
              to: admin,
              body: { type: "answer", connection, sdp: answer.sdp! },
            });
          } else if (body.connection === connection && signal.from === admin) {
            if (body.type === "ice" && body.ice) await queue?.add(body.ice);
            if (body.type === "hangup") hang();
          } else if (body.type === "ice" && body.ice) {
            if (earlyIce.size > 8) earlyIce.clear();
            const waiting = earlyIce.get(body.connection) ?? [];
            if (waiting.length < 40) waiting.push(body.ice);
            earlyIce.set(body.connection, waiting);
          }
        }
      } catch {
        if (!stopped)
          current.current.onMessage("Live monitoring connection interrupted. Reconnecting…");
      } finally {
        running = false;
        if (!stopped) {
          clearTimeout(timer);
          timer = setTimeout(() => void poll(), again ? 0 : 1000);
          again = false;
        }
      }
    }
    const resumeAudio = () => {
      void audio?.play().catch(() => {});
    };
    let localDeparture:string|null=null;
    const focus = () => {
      if(document.hidden || !document.hasFocus()) {
        localDeparture ??= new Date().toISOString();
        current.current.onWarning?.(localDeparture);
      } else localDeparture=null;
      void poll();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("blur", focus);
    window.addEventListener("focus", focus);
    window.addEventListener("enable-proctor-sound", resumeAudio);
    void poll();
    const sampleVideo = document.createElement('video');
    sampleVideo.muted=true; sampleVideo.playsInline=true; sampleVideo.srcObject=current.current.stream;
    void sampleVideo.play().catch(()=>{});
    let sampling=false, lastFrame=-1;
    const sampleTimer=setInterval(async()=>{
      if(stopped || sampling || sampleVideo.readyState<2 || !sampleVideo.videoWidth || document.hidden) return;
      if(sampleVideo.currentTime===lastFrame) return;
      lastFrame=sampleVideo.currentTime;sampling=true;
      try {
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
        canvas.getContext('2d')?.drawImage(sampleVideo,0,0,320,240);
        const response=await liveExamVision({data:{attemptId,image:canvas.toDataURL('image/jpeg',0.65).split(',')[1]!}});
        if (!stopped) {
          if (response.state === 'unavailable') current.current.onMessage(response.message);
          if (response.state === 'flagged') current.current.onSuspend();
          else await poll(); // Refresh the server's countdown immediately after a visual check.
        }
      } catch { /* Polling continues if visual inference is unavailable. */ }
      finally {sampling=false;}
    },4000);
    return () => {
      clearInterval(sampleTimer); sampleVideo.pause();sampleVideo.srcObject=null;
      current.current.onWarning?.(null);
      stopped = true;
      clearTimeout(timer);
      hang();
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("blur", focus);
      window.removeEventListener("focus", focus);
      window.removeEventListener("enable-proctor-sound", resumeAudio);
      // A navigation away remains a departure. Completing an attempt closes a focused room.
      void liveExamPoll({
        data: { attemptId, after, ...state(), focused: !current.current.active, close: true },
      }).catch(() => {});
    };
  }, [options.active, options.attemptId]);
}
