import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MfpButton } from "@/components/MfpButton";

const { chat, speak, stop, historyFn, auth } = vi.hoisted(() => ({ chat: vi.fn(), speak: vi.fn(), stop: vi.fn(), historyFn: vi.fn(), auth: { owner: null as string | null } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ session: auth.owner ? { user: { id: auth.owner } } : null }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn === historyFn ? historyFn : chat }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => false }));
vi.mock("@/lib/settings", () => ({ useSiteSettings: () => ({}) }));
vi.mock("@/lib/mfp-image.functions", () => ({ mfpCreateImage: vi.fn() }));
vi.mock("@/lib/mfp-history.functions", () => ({ mfpHistory: historyFn }));
vi.mock("@/lib/ai.functions", () => ({ mfpChat: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({
  order: async () => ({ data: [{ id: "c1", code: "BUS101", title: "Introduction to Business", description: "Business basics", course_units: [{ id: "u1", title: "Forms of ownership", sort_order: 1 }] }] }),
  in: async () => ({ data: [{ id: "p1", unit_id: "u1", title: "Stakeholders", content: "Stakeholders include owners, employees and customers.", sort_order: 1 }] }),
}) }) } }));
vi.mock("@/lib/use-mfp-voice", () => ({ useMfpVoice: () => ({ supported: true, speaking: false, micSupported: false, stop, speak }) }));

afterEach(() => { auth.owner = null; cleanup(); localStorage.clear(); vi.clearAllMocks(); });

it("sets up a course quiz with topic, difficulty and question type before the AI asks", async () => {
  chat.mockResolvedValue({ ok: true, reply: "Question 1 of 3: What is a sole proprietorship?" });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  fireEvent.click(screen.getByRole("button", { name: "Open MFP assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "Create image" }));
  fireEvent.click(screen.getByRole("button", { name: "Quiz Me" }));
  expect(await screen.findByRole("option", { name: "BUS101: Introduction to Business" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Hard" }));
  fireEvent.click(screen.getByRole("button", { name: "Open-ended" }));
  fireEvent.click(await screen.findByRole("button", { name: "Start Quiz" }));
  expect(await screen.findByText("Question 1 of 3: What is a sole proprietorship?")).toBeInTheDocument();
  const prompt = chat.mock.calls[0]![0].data.messages[0].content;
  expect(prompt).toContain("BUS101: Introduction to Business");
  expect(prompt).toContain("Forms of ownership");
  expect(prompt).toContain("Stakeholders include owners, employees and customers.");
  expect(prompt).toContain("Hard difficulty");
  expect(prompt).toContain("open-ended");
  expect(screen.getByText(/Start a 3-question hard open-ended practice quiz/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ask MFP" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Study Plan" })).toHaveClass("text-emerald-900");
  expect(screen.getByRole("button", { name: "AI Project Coach" })).toBeInTheDocument();
});

it("offers no general topic and accepts numbered multiple-choice answers", async () => {
  let firstReply!: (v: unknown) => void;
  chat.mockReturnValueOnce(new Promise((r) => { firstReply = r; }))
    .mockResolvedValueOnce({ ok: true, reply: "**Correct.** Employees are stakeholders." });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  fireEvent.click(screen.getByRole("button", { name: "Open MFP assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "Quiz Me" }));
  await screen.findByRole("option", { name: "BUS101: Introduction to Business" });
  expect(screen.queryByRole("option", { name: /General business/ })).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("four buttons, A to D");
  await screen.findByRole("checkbox", { name: "Page 1: Stakeholders" });
  fireEvent.click(await screen.findByRole("button", { name: "Start Quiz" }));
  expect(await screen.findByRole("status")).toHaveTextContent(/writing your questions/);
  await act(async () => firstReply({ ok: true, reply: "**Question 1 of 3**\n\nWho is a stakeholder?\n\nA. Employees\nB. Planets\nC. Tides\nD. Comets" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "1: A" } });
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(await screen.findByText("Employees are stakeholders.", { exact: false })).toBeInTheDocument();
  expect(chat.mock.calls[1]![0].data.messages.at(-1).content).toBe("1: A");
});

it("shows replies silently, plays only on request, and does not restore guest conversations", async () => {
  chat.mockResolvedValue({ ok: true, reply: "Interest is the cost of borrowing." });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  act(() => window.dispatchEvent(new CustomEvent("mfp-ask", { detail: "Explain interest" })));
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(await screen.findByText("Interest is the cost of borrowing.")).toBeInTheDocument();
  expect(speak).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Listen to answer" }));
  expect(speak).toHaveBeenCalledExactlyOnceWith("Interest is the cost of borrowing.");
  cleanup();
  speak.mockClear();
  render(<MfpButton />);
  act(() => window.dispatchEvent(new CustomEvent("mfp-ask", { detail: "Another question" })));
  expect(screen.queryByRole("button", { name: "My chats" })).not.toBeInTheDocument();
  expect(screen.queryByText("Interest is the cost of borrowing.")).not.toBeInTheDocument();
  expect(localStorage.getItem("mfp-chats")).toBeNull();
  expect(speak).not.toHaveBeenCalled();
});


it("creates a downloadable image without saving image data in browser chat history", async () => {
  chat.mockResolvedValue({ ok: true, reply: "Your image is ready.", image: "data:image/png;base64,YWJj" });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  act(() => window.dispatchEvent(new CustomEvent("mfp-ask", { detail: "A realistic mountain lake" })));
  fireEvent.click(screen.getByRole("button", { name: "Create image" }));
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(await screen.findByRole("link", { name: "Download image" })).toHaveAttribute("download", "mfp-image.png");
  expect(screen.getByAltText("Generated image")).toHaveAttribute("src", "data:image/png;base64,YWJj");
  expect(chat).toHaveBeenCalledWith({ data: { prompt: "A realistic mountain lake" } });
  expect(localStorage.getItem("mfp-chats")).toBeNull();
});

it("accepts clipboard image files through the attachment validation", () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  act(() => window.dispatchEvent(new CustomEvent("mfp-ask", { detail: "Explain this photo" })));
  fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { items: [{ type: "image/png", getAsFile: () => new File([new Uint8Array(10_000_001)], "paste.png", { type: "image/png" }) }] } });
  expect(screen.getByRole("alert")).toHaveTextContent("under 10 MB");
});

it("prepares a standalone document with export controls", async () => {
  chat.mockResolvedValue({ ok: true, reply: "## Finance study guide" });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  act(() => window.dispatchEvent(new CustomEvent("mfp-ask", { detail: "Make a finance guide" })));
  fireEvent.click(screen.getByRole("button", { name: "Write document" }));
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(await screen.findByRole("button", { name: "Save PDF" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Markdown" })).toBeInTheDocument();
  expect(chat.mock.calls[0]![0].data.messages[0].content).toContain("standalone document");
});

it("supports a custom count and optional course pages with the entire course selected by default", async () => {
  chat.mockResolvedValue({ ok: true, reply: "Your quiz" });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  fireEvent.click(screen.getByRole("button", { name: "Open MFP assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "Quiz Me" }));
  await screen.findByRole("checkbox", { name: "Page 1: Stakeholders" });
  expect(screen.getByText("Entire course")).toBeInTheDocument();
  const count = screen.getByRole("spinbutton", { name: /Custom number/ });
  fireEvent.change(count, { target: { value: "0" } });
  expect(screen.getByRole("button", { name: "Start Quiz" })).toBeDisabled();
  fireEvent.change(count, { target: { value: "8" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Page 1: Stakeholders" }));
  expect(screen.getByText("1 selected pages")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Start Quiz" }));
  await screen.findByText("Your quiz");
  expect(chat.mock.calls[0]![0].data.messages[0].content).toContain("Generate exactly 8 questions together");
});


it("loads only signed-in history and clears it immediately on sign-out or account change", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  auth.owner = "account-a";
  historyFn.mockResolvedValueOnce([{ id, title: "Private saved chat", msgs: [{ role: "assistant", content: "Account A private answer" }] }]);
  Element.prototype.scrollIntoView = vi.fn();
  const view = render(<MfpButton />);
  fireEvent.click(screen.getByRole("button", { name: "Open MFP assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "My chats" }));
  fireEvent.click(await screen.findByRole("button", { name: "Private saved chat" }));
  expect(screen.getByText("Account A private answer")).toBeInTheDocument();
  auth.owner = null;
  view.rerender(<MfpButton />);
  fireEvent.click(screen.getByRole("button", { name: "Open MFP assistant" }));
  expect(screen.queryByText("Account A private answer")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "My chats" })).not.toBeInTheDocument();
  auth.owner = "account-b";
  historyFn.mockResolvedValueOnce([]);
  view.rerender(<MfpButton />);
  fireEvent.click(screen.getByRole("button", { name: "Open MFP assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "My chats" }));
  expect(await screen.findByText("No saved chats yet.")).toBeInTheDocument();
  expect(screen.queryByText("Private saved chat")).not.toBeInTheDocument();
});

it("never loads shared legacy history for guests and still answers their questions", async () => {
  localStorage.setItem("mfp-chats", JSON.stringify([{ id: "legacy", title: "Someone else's question", msgs: [] }]));
  historyFn.mockClear();
  chat.mockResolvedValue({ ok: true, reply: "Guest answer" });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  act(() => window.dispatchEvent(new CustomEvent("mfp-ask", { detail: "Guest question" })));
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(await screen.findByText("Guest answer")).toBeInTheDocument();
  expect(historyFn).not.toHaveBeenCalled();
  expect(screen.queryByText("Someone else's question")).not.toBeInTheDocument();
  expect(localStorage.getItem("mfp-chats")).toContain("legacy");
});
