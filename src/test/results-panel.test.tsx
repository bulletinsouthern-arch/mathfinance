import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsPanel } from "@/components/admin/ResultsPanel";

const { list, decide, remove } = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/results.functions", () => ({ listResults: list, decideRetake: decide, deleteResult: remove }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ResultsPanel /></QueryClientProvider>);
  return client;
}
const empty = { attempts: [], requests: [], people: {}, contactsUnavailable: false };
beforeEach(() => { list.mockReset(); decide.mockReset(); });
afterEach(cleanup);

describe("results panel states", () => {
  it("replaces a failed load with a retry action and recovers", async () => {
    list.mockRejectedValueOnce(new Error("private configuration detail")).mockResolvedValue(empty);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Results could not be loaded");
    expect(screen.queryByText("Loading results…")).not.toBeInTheDocument();
    expect(screen.queryByText("private configuration detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No exam or quiz results yet.")).toBeInTheDocument();
    expect(screen.getByText("Retake requests (0 pending)")).toBeInTheDocument();
  });

  it("renders takers, scores, and the original table columns", async () => {
    list.mockResolvedValue({ ...empty, attempts: [{ id: "a", user_id: "u", percent: 100, score: 2, total: 2, passed: true, created_at: "2026-10-27", quizzes: { title: "TEST EXAM", kind: "exam" } }], people: { u: { username: "Learner", email: "learner@example.com" } } });
    mount();
    expect(await screen.findByText("Learner")).toBeInTheDocument();
    expect(screen.getByText("100% (2/2)")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    for (const column of ["Student", "Email", "Assessment", "Date", "Score", "Result"]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", expect.stringContaining("mailto:learner@example.com"));
  });

  it("keeps the table visible when student contact details are unavailable", async () => {
    list.mockResolvedValue({ ...empty, contactsUnavailable: true });
    mount();
    expect(await screen.findByText("Some student contact details are unavailable. Results are shown below.")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

it("deletes an attempt and refreshes the table", async () => {
  list.mockResolvedValueOnce({ ...empty, attempts: [{ id: "attempt-1", user_id: "u", percent: 100, score: 1, total: 1, passed: true, created_at: "2026-10-27" }], people: { u: { fullName: "Ada Lovelace", username: "legacy", email: "" } } }).mockResolvedValue(empty);
  remove.mockResolvedValue({ ok: true });
  mount();
  expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete attempt" }));
  expect(await screen.findByText("No exam or quiz results yet.")).toBeInTheDocument();
  expect(remove).toHaveBeenCalledWith({ data: { id: "attempt-1", table: "quiz_attempts" } });
});
