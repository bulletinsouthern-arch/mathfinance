import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LessonReader } from "@/components/LessonReader";

let spoken: SpeechSynthesisUtterance[];
const cancel = vi.fn();
beforeEach(() => {
  spoken = [];
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    text: string;
    constructor(text: string) { this.text = text; }
  });
  vi.stubGlobal("speechSynthesis", { cancel, resume: vi.fn(), speak: (u: SpeechSynthesisUtterance) => spoken.push(u) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function lesson() {
  return render(<LessonReader><h2>Income</h2><p>Revenue is money earned.</p><ul><li><span>Subtract costs to calculate profit.</span></li></ul></LessonReader>);
}

it("moves the square highlight with speech and finishes cleanly", () => {
  const { container } = lesson();
  fireEvent.click(screen.getByRole("button", { name: "Listen" }));
  expect(spoken[0]!.text).toBe("Income");
  expect(screen.getByRole("heading")).toHaveAttribute("data-reading-active");
  act(() => spoken[0]!.onend?.({} as SpeechSynthesisEvent));
  expect(screen.getByText("Revenue is money earned.")).toHaveAttribute("data-reading-active");
  expect(screen.getByRole("heading")).not.toHaveAttribute("data-reading-active");
  act(() => spoken[1]!.onend?.({} as SpeechSynthesisEvent));
  expect(spoken[2]!.text).toBe("Subtract costs to calculate profit.");
  act(() => spoken[2]!.onend?.({} as SpeechSynthesisEvent));
  expect(screen.getByRole("button", { name: "Replay" })).toBeInTheDocument();
  expect(container.querySelector("[data-reading-active]")).toBeNull();
});

it("pauses, seeks backward and forward, and ignores cancelled utterances", () => {
  lesson();
  fireEvent.click(screen.getByRole("button", { name: "Listen" }));
  const cancelled = spoken[0]!;
  fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
  expect(spoken[1]!.text).toBe("Subtract costs to calculate profit.");
  act(() => cancelled.onend?.({} as SpeechSynthesisEvent));
  expect(spoken).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous passage" }));
  expect(spoken).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(spoken[2]!.text).toBe("Revenue is money earned.");
  fireEvent.click(screen.getByRole("button", { name: "Stop reading" }));
  expect(screen.getByRole("slider")).toHaveValue("0");
  expect(screen.getByRole("button", { name: "Listen" })).toBeInTheDocument();
});

it("cancels narration when leaving the lesson", () => {
  const { unmount } = lesson();
  fireEvent.click(screen.getByRole("button", { name: "Listen" }));
  unmount();
  act(() => spoken[0]!.onend?.({} as SpeechSynthesisEvent));
  expect(spoken).toHaveLength(1);
  expect(cancel).toHaveBeenCalled();
});

it("reports missing speech support", () => {
  vi.stubGlobal("speechSynthesis", undefined);
  lesson();
  fireEvent.click(screen.getByRole("button", { name: "Listen" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Reading aloud is unavailable");
});
