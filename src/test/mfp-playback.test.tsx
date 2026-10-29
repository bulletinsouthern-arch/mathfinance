import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MfpButton } from "@/components/MfpButton";

const { chat, speak, stop } = vi.hoisted(() => ({ chat: vi.fn(), speak: vi.fn(), stop: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => chat }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => false }));
vi.mock("@/lib/settings", () => ({ useSiteSettings: () => ({}) }));
vi.mock("@/lib/ai.functions", () => ({ mfpChat: vi.fn() }));
vi.mock("@/lib/use-mfp-voice", () => ({ useMfpVoice: () => ({ supported: true, speaking: false, micSupported: false, stop, speak }) }));

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

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
