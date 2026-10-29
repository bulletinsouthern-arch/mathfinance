import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MfpButton } from "@/components/MfpButton";

const { chat, speak, stop } = vi.hoisted(() => ({ chat: vi.fn(), speak: vi.fn(), stop: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => chat }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => false }));
vi.mock("@/lib/settings", () => ({ useSiteSettings: () => ({}) }));
vi.mock("@/lib/mfp-image.functions", () => ({ mfpCreateImage: vi.fn() }));
vi.mock("@/lib/ai.functions", () => ({ mfpChat: vi.fn() }));
vi.mock("@/lib/use-mfp-voice", () => ({ useMfpVoice: () => ({ supported: true, speaking: false, micSupported: false, stop, speak }) }));

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

it("starts the green study shortcut in chat mode even when image mode was selected", async () => {
  chat.mockResolvedValue({ ok: true, reply: "What topic would you like to practice?" });
  Element.prototype.scrollIntoView = vi.fn();
  render(<MfpButton />);
  fireEvent.click(screen.getByRole("button", { name: "Open MFP assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "Create image" }));
  fireEvent.click(screen.getByRole("button", { name: "Quiz Me" }));
  expect(await screen.findByText("What topic would you like to practice?")).toBeInTheDocument();
  expect(chat.mock.calls[0]![0].data.messages[0].content).toContain("one question at a time");
  expect(screen.getByRole("button", { name: "Ask MFP" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Study Plan" })).toHaveClass("text-emerald-900");
  expect(screen.getByRole("button", { name: "AI Project Coach" })).toBeInTheDocument();
});

it("shows new and saved replies silently and plays only the selected answer on request", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "My chats" }));
  fireEvent.click(screen.getByRole("button", { name: "Explain interest" }));
  expect(screen.getByText("Interest is the cost of borrowing.")).toBeInTheDocument();
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
  expect(localStorage.getItem("mfp-chats")).not.toContain("base64");
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
