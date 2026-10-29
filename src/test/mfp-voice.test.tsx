import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMfpVoice } from "@/lib/use-mfp-voice";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reads answers in chunks, ignores cancelled callbacks, and stops on close", () => {
  const spoken: SpeechSynthesisUtterance[] = [];
  const cancel = vi.fn();
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  vi.stubGlobal("speechSynthesis", { getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn(), cancel, resume: vi.fn(), speak: (u: SpeechSynthesisUtterance) => spoken.push(u) });
  const { result, rerender } = renderHook(({ active }) => useMfpVoice(active, vi.fn()), { initialProps: { active: true } });
  act(() => result.current.speak("First answer. ".repeat(140)));
  expect(result.current.speaking).toBe(true);
  expect(spoken).toHaveLength(3); // All chunks are ready before the first finishes.
  const first = spoken[0]!;
  act(() => first.onend?.({} as SpeechSynthesisEvent));
  expect(spoken).toHaveLength(3);
  act(() => result.current.stop());
  act(() => spoken[1]!.onend?.({} as SpeechSynthesisEvent));
  expect(spoken).toHaveLength(3);
  expect(result.current.speaking).toBe(false);
  rerender({ active: false });
  act(() => result.current.speak("Late answer after closing"));
  expect(spoken).toHaveLength(3);
  expect(cancel).toHaveBeenCalled();
});

it("shows a readable fallback when speech is unavailable", () => {
  vi.stubGlobal("speechSynthesis", undefined);
  const { result } = renderHook(() => useMfpVoice(true, vi.fn()));
  act(() => result.current.speak("An answer"));
  expect(result.current.supported).toBe(false);
  expect(result.current.error).toContain("read the answer");
});

it("uses a brisk fixed pace and skips emoji", () => {
  const spoken: SpeechSynthesisUtterance[] = [];
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  vi.stubGlobal("speechSynthesis", { getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn(), cancel: vi.fn(), resume: vi.fn(), speak: (u: SpeechSynthesisUtterance) => spoken.push(u) });
  const { result } = renderHook(() => useMfpVoice(true, vi.fn()));
  act(() => result.current.speak("Hello 👩🏽‍🏫! ".repeat(40)));
  expect(spoken[0]!.rate).toBe(1.8);
  expect(spoken[0]!.text).not.toContain("👩");
  act(() => spoken[0]!.onend?.({} as SpeechSynthesisEvent));
  expect(result.current.speaking).toBe(false);
});
