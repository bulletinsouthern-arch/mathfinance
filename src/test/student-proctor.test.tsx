import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderHook, waitFor, fireEvent, cleanup } from "@testing-library/react";
const { poll, signal } = vi.hoisted(() => ({ poll: vi.fn(), signal: vi.fn() }));
vi.mock("@/lib/proctor.functions", () => ({ liveExamPoll: poll, liveExamSignal: signal }));
import { useStudentProctor } from "@/hooks/use-student-proctor";
const options = () => ({
  active: true,
  attemptId: "attempt",
  stream: {
    getAudioTracks: () => [{ enabled: true, muted: false, readyState: "live" }],
  } as unknown as MediaStream,
  answered: 1,
  total: 2,
  onMessage: vi.fn(),
  onSuspend: vi.fn(),
  onKick: vi.fn(),
  onCall: vi.fn(),
});
beforeEach(() => {
  poll.mockReset().mockResolvedValue({ rooms: [], signals: [] });
  signal.mockReset();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("reports tab departure immediately and sends return state without resetting the polling connection", async () => {
  const props = options();
  renderHook(() => useStudentProctor(props));
  await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() =>
    expect(poll.mock.calls.some(([{ data }]) => data.focused === false)).toBe(true),
  );
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(poll.mock.calls.at(-1)![0].data.focused).toBe(true));
  expect(props.onSuspend).not.toHaveBeenCalled();
});
it("locks the attempt on a server suspension before accepting new signaling", async () => {
  poll.mockResolvedValue({ rooms: [{ suspended: true }], signals: [] });
  const props = options();
  renderHook(() => useStudentProctor(props));
  await waitFor(() => expect(props.onSuspend).toHaveBeenCalledTimes(1));
  expect(signal).not.toHaveBeenCalled();
});
it("retains a departure when an active assessment unmounts instead of claiming the window returned", async () => {
  const props = options();
  const view = renderHook(() => useStudentProctor(props));
  await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
  view.unmount();
  expect(poll.mock.calls.at(-1)![0].data).toMatchObject({
    attemptId: "attempt",
    focused: false,
    close: true,
  });
});
it("ends monitoring on completed attempts without reporting a new departure", async () => {
  const props = options();
  const view = renderHook(({ active }) => useStudentProctor({ ...props, active }), {
    initialProps: { active: true },
  });
  await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
  view.rerender({ active: false });
  expect(poll.mock.calls.at(-1)![0].data).toMatchObject({ focused: true, close: true });
});
