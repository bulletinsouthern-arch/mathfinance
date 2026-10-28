import { liveExamSignal } from "./proctor.functions";
// Media travels peer-to-peer. Netlify stores only authenticated, short-lived signaling.
export function createExamPeer() {
  return new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
}
export type ExamSignal = {
  attemptId: string;
  to: string;
  body: {
    type: "offer" | "answer" | "ice" | "hangup" | "warn" | "kick";
    connection: string;
    sdp?: string;
    ice?: RTCIceCandidateInit;
    text?: string;
  };
};
export function sendExamSignal(data: ExamSignal) {
  return liveExamSignal({ data });
}
export function createIceQueue(peer: RTCPeerConnection) {
  const pending: RTCIceCandidateInit[] = [];
  return {
    async add(ice: RTCIceCandidateInit) {
      if (peer.remoteDescription) await peer.addIceCandidate(ice);
      else pending.push(ice);
    },
    async flush() {
      for (const ice of pending.splice(0)) await peer.addIceCandidate(ice);
    },
  };
}
