import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ grade: vi.fn(), blocker: vi.fn(), fullscreen: vi.fn(), exit: vi.fn() }));
vi.mock("@/lib/authoring.functions", () => ({ getQuizQuestions: vi.fn() }));
vi.mock("@/lib/exam.functions", () => ({ gradeExam: mocks.grade }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options, useParams: () => ({ quizId: "quiz" }) }),
  Link: ({ children }: any) => <a>{children}</a>,
  useBlocker: mocks.blocker,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAdmin: false, session: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: any) => ({ data:
  queryKey[0] === "exam" ? { title: "Assessment", kind: "exam", pass_percent: 70, time_limit_minutes: 0 } :
  queryKey[0] === "exam-q" ? [{ id: "q", question: "Choose an answer", option_a: "First", option_b: "Second", qtype: "mc" }] : null,
}) }));
import { Route } from "@/routes/_authenticated/exam.$quizId";
const Exam = (Route as any).component;
let fullscreenElement: Element | null;
beforeEach(() => {
  vi.clearAllMocks();
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: mocks.fullscreen.mockImplementation(function (this: Element) { fullscreenElement = this; return Promise.resolve(); }) });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: mocks.exit.mockImplementation(() => { fullscreenElement = null; return Promise.resolve(); }) });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function start() {
  render(<Exam />);
  fireEvent.click(screen.getByRole("button", { name: "Turn on webcam" }));
  fireEvent.click(await screen.findByRole("button", { name: "Start exam in full screen" }));
}
it("does not reveal questions when fullscreen is refused", async () => {
  mocks.fullscreen.mockRejectedValue(new Error("denied"));
  await start();
  expect(await screen.findByRole("alert")).toHaveTextContent("Fullscreen is required");
  expect(screen.queryByText("1. Choose an answer")).not.toBeInTheDocument();
});
it.each(["fullscreenchange", "visibilitychange", "blur"])("locks on %s and keeps the original answers locked across a failed save", async (event) => {
  mocks.grade.mockRejectedValueOnce(new Error("offline")).mockImplementation(() => new Promise(() => {}));
  await start();
  fireEvent.click(await screen.findByRole("button", { name: "a. First" }));
  if (event === "fullscreenchange") fullscreenElement = null;
  if (event === "visibilitychange") Object.defineProperty(document, "hidden", { configurable: true, value: true });
  fireEvent(event === "blur" ? window : document, new Event(event));
  // Multiple browser signals for one exit must not create duplicate submissions.
  fireEvent(window, new Event("blur"));
  await screen.findByRole("button", { name: "Retry submission" });
  expect(mocks.grade).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "b. Second" })).not.toBeInTheDocument();
  expect(mocks.exit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry submission" }));
  await waitFor(() => expect(mocks.grade).toHaveBeenCalledTimes(2));
  expect(mocks.grade.mock.calls[1]![0].data).toEqual({ quizId: "quiz", answers: { q: "a" }, warnings: 1 });
});
it("blocks navigation during the attempt and locks answers", async () => {
  mocks.grade.mockImplementation(() => new Promise(() => {}));
  await start();
  await screen.findByText("1. Choose an answer");
  const options = mocks.blocker.mock.calls.at(-1)![0];
  expect(options.disabled).toBe(false);
  expect(options.enableBeforeUnload).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "a. First" }));
  let blocked: boolean;
  const { act } = await import("@testing-library/react");
  act(() => { blocked = options.shouldBlockFn(); });
  expect(blocked!).toBe(true);
  expect(await screen.findByRole("status")).toHaveTextContent("answers locked");
});
it("releases navigation and fullscreen only after successful submission", async () => {
  mocks.grade.mockResolvedValue({ percent: 100, passed: true, score: 1, total: 1, results: { q: true }, correct: { q: "a" }, openScores: {}, feedback: {} });
  await start();
  fireEvent.click(await screen.findByRole("button", { name: "a. First" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit exam" }));
  expect(await screen.findByText("100%")).toBeInTheDocument();
  expect(mocks.exit).toHaveBeenCalledTimes(1);
  expect(mocks.blocker.mock.calls.at(-1)![0].disabled).toBe(true);
  expect(mocks.grade).toHaveBeenCalledTimes(1);
  expect(mocks.grade.mock.calls[0]![0].data.warnings).toBe(0);
});

it("shows full chosen and correct answers plus the reason the chosen answer is wrong", async () => {
  mocks.grade.mockResolvedValue({ percent: 0, passed: false, score: 0, total: 1, results: { q: false }, correct: { q: "b" }, answerText: { q: "Second" }, explanations: { q: "Second satisfies the condition. First does not because it omits the required step." }, openScores: {}, feedback: {} });
  await start();
  fireEvent.click(await screen.findByRole("button", { name: "a. First" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit exam" }));
  expect(await screen.findByText("Your answer: A. First")).toBeInTheDocument();
  expect(screen.getByText("Correct answer: B. Second")).toBeInTheDocument();
  expect(screen.getByText("Second satisfies the condition. First does not because it omits the required step.")).toBeInTheDocument();
});
