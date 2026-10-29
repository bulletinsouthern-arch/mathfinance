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
  act(() => result.current.speak("First answer. ".repeat(40)));
  expect(result.current.speaking).toBe(true);
  const first = spoken[0]!;
  act(() => first.onend?.({} as SpeechSynthesisEvent));
  expect(spoken).toHaveLength(2);
  act(() => result.current.stop());
  act(() => spoken[1]!.onend?.({} as SpeechSynthesisEvent));
  expect(spoken).toHaveLength(2);
  expect(result.current.speaking).toBe(false);
  rerender({ active: false });
  act(() => result.current.speak("Late answer after closing"));
  expect(spoken).toHaveLength(2);
  expect(cancel).toHaveBeenCalled();
});

it("shows a readable fallback when speech is unavailable", () => {
  vi.stubGlobal("speechSynthesis", undefined);
  const { result } = renderHook(() => useMfpVoice(true, vi.fn()));
  act(() => result.current.speak("An answer"));
  expect(result.current.supported).toBe(false);
  expect(result.current.error).toContain("Choose Read");
});
