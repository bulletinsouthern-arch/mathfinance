import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
const { poll, signal, instances } = vi.hoisted(() => ({
  poll: vi.fn(),
  signal: vi.fn(),
  instances: [] as any[],
}));
vi.mock("@/lib/proctor.functions", () => ({
  liveExamPoll: poll,
  liveExamSignal: signal,
  liveExamVision: vi.fn(),
  liveExamRemove: vi.fn(),
}));
vi.mock("@/components/admin/IntegrityReviews", () => ({ IntegrityReviews: () => null }));
import { ProctorLive } from "@/components/admin/ProctorLive";
class Peer {
  connectionState = "connected";
  signalingState = "have-local-offer";
  remoteDescription = null;
  senders: any[] = [];
  close = vi.fn();
  addIceCandidate = vi.fn();
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  createOffer = vi.fn().mockResolvedValue({ sdp: "offer", type: "offer" });
  ontrack: any;
  onicecandidate: any;
  onconnectionstatechange: any;
  constructor() {
    instances.push(this);
  }
  addTransceiver() {
    const sender = { replaceTrack: vi.fn().mockResolvedValue(undefined) };
    this.senders.push(sender);
    return { sender };
  }
}
const rooms = [
  {
    attemptId: "one",
    userId: "student-one",
    name: "First student",
    warnings: 0,
    focused: true,
    fullscreen: true,
    mic: true,
    answered: 0,
    total: 2,
    awaySince: null,
    suspended: false,
    visualFlagged: false,
  },
  {
    attemptId: "two",
    userId: "student-two",
    name: "Second student",
    warnings: 0,
    focused: true,
    fullscreen: true,
    mic: true,
    answered: 0,
    total: 2,
    awaySince: null,
    suspended: false,
    visualFlagged: false,
  },
];
let track: { enabled: boolean; readyState: string; stop: ReturnType<typeof vi.fn> };
beforeEach(() => {
  instances.length = 0;
  poll.mockReset().mockResolvedValue({ rooms, signals: [] });
  signal.mockReset().mockResolvedValue({ ok: true });
  track = { enabled: true, readyState: "live", stop: vi.fn() };
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal(
    "MediaStream",
    class {
      addTrack = vi.fn();
      getTracks = () => [];
    },
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getAudioTracks: () => [track], getTracks: () => [track] }),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("opens independent live feeds automatically, with sound muted until the proctor chooses Listen", async () => {
  const view = render(<ProctorLive />);
  await screen.findByText("Second student");
  await waitFor(() => expect(signal).toHaveBeenCalledTimes(2));
  const videos = [...view.container.querySelectorAll("video")];
  expect(videos).toHaveLength(2);
  expect(videos.every((v) => v.muted)).toBe(true);
  const first = screen.getByText("First student").closest("article")!;
  fireEvent.click(within(first).getByRole("button", { name: "Listen" }));
  expect(videos[0]!.muted).toBe(false);
  expect(videos[1]!.muted).toBe(true);
});
it("routes the administrator microphone to only the selected student and stops it on mute", async () => {
  render(<ProctorLive />);
  await screen.findByText("Second student");
  await waitFor(() => expect(instances).toHaveLength(2));
  const first = screen.getByText("First student").closest("article")!;
  const second = screen.getByText("Second student").closest("article")!;
  await act(async () => fireEvent.click(within(first).getByRole("button", { name: "Talk" })));
  expect(instances[0].senders[0].replaceTrack).toHaveBeenLastCalledWith(track);
  expect(instances[1].senders[0].replaceTrack).toHaveBeenLastCalledWith(null);
  await act(async () => fireEvent.click(within(second).getByRole("button", { name: "Talk" })));
  expect(instances[0].senders[0].replaceTrack).toHaveBeenLastCalledWith(null);
  expect(instances[1].senders[0].replaceTrack).toHaveBeenLastCalledWith(track);
  fireEvent.click(within(second).getByRole("button", { name: "Mute my mic" }));
  expect(track.enabled).toBe(false);
});
it("closes all peer connections and stops the microphone when the room closes", async () => {
  const view = render(<ProctorLive />);
  await screen.findByText("First student");
  await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Talk" })[0]!));
  view.unmount();
  expect(instances.every((p) => p.close.mock.calls.length)).toBe(true);
  expect(track.stop).toHaveBeenCalled();
});
