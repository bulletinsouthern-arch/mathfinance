vi.mock("@/lib/student.functions", () => ({ assessmentPrograms:vi.fn().mockResolvedValue([]) }));
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
beforeEach(() => { list.mockReset(); decide.mockReset(); remove.mockReset(); });
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

  it("renders names, email, program, course, and assessment separately", async () => {
    list.mockResolvedValue({ ...empty, attempts: [{ id: "a", quiz_id:"quiz", user_id: "u", percent: 100, score: 2, total: 2, passed: true, created_at: "2026-10-27", quizzes: { title: "TEST EXAM", kind: "exam", course_id:"course", courses:{title:"Business Finance"} } }], people: { u: { username: "Learner Santos", firstName:"Learner", lastName:"Santos", program:"Business Administration", email: "learner@example.com" } } });
    mount();
    expect(await screen.findByText("Learner")).toBeInTheDocument();
    expect(screen.getByText("100% (2/2)")).toBeInTheDocument();
    expect(screen.getByRole("cell",{name:"Santos"})).toBeInTheDocument();
    expect(screen.getByRole("cell",{name:"Business Administration"})).toBeInTheDocument();
    expect(screen.getByRole("cell",{name:"Business Finance"})).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    for (const column of ["First name", "Last name", "Email", "Student program", "Course", "Assessment", "Date", "Score", "Result"]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", expect.stringContaining("mailto:learner@example.com"));
  });

  it("keeps the table visible when student contact details are unavailable", async () => {
    list.mockResolvedValue({ ...empty, contactsUnavailable: true });
    mount();
    expect(await screen.findByText("Some historical accounts have no recorded email. Students can save their details in Account Settings; administrator account lookup also fills historical emails when available.")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

it("confirms deletion, preserves the row on cancellation, and refreshes after deleting", async () => {
  const row = {id:"result",user_id:"u",quiz_id:"q",created_at:"2026-10-27",quizzes:{title:"Finance"}};
  list.mockResolvedValue({...empty,attempts:[row],people:{u:{firstName:"Maria"}}});
  remove.mockResolvedValue({ok:true});
  mount();
  fireEvent.click(await screen.findByRole("button",{name:"Delete result"}));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Maria");
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Delete result"}));
  list.mockResolvedValue(empty);
  fireEvent.click(screen.getByRole("button",{name:"Confirm delete"}));
  expect(await screen.findByText("No exam or quiz results yet.")).toBeInTheDocument();
  expect(remove).toHaveBeenCalledWith({data:{id:"result",table:"quiz_attempts"}});
});
