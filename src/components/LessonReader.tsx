import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Square, Volume2 } from "lucide-react";

import { silenceEmoji, speechChunks, TUTOR_READING_RATE } from "@/lib/reading-pace";

type Passage = { text: string; element: HTMLElement; offset: number };

/** Reads the rendered textbook so the voice and highlight always use the same text. */
export function LessonReader({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const passages = useRef<Passage[]>([]);
  const generation = useRef(0);
  const [position, setPosition] = useState(0);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const elements = content.current?.querySelectorAll<HTMLElement>("h2, h3, p, li, blockquote, figcaption") ?? [];
    passages.current = Array.from(elements).filter(el => !el.querySelector("h2, h3, p, li, blockquote, figcaption"))
      .flatMap(element => {
        // Keep sentence punctuation and offsets intact while limiting long utterances.
        const text = element.textContent ?? "";
        const chunks = speechChunks(text);
        let offset = 0;
        return chunks.map(text => { const start = offset; offset += text.length; return { text, element, offset: start }; }).filter(p => p.text.trim());
      });
    setTotal(passages.current.length);
    return () => { generation.current++; window.speechSynthesis?.cancel(); };
  }, []);

  useEffect(() => {
    if (state === "idle" || state === "ended") return;
    const element = passages.current[position]?.element;
    if (!element) return;
    element.setAttribute("data-reading-active", "true");
    return () => element.removeAttribute("data-reading-active");
  }, [position, state]);

  function highlight(passage: Passage, start = 0, length = passage.text.trimEnd().length) {
    // CSS ranges preserve inline links, emphasis, and the original lesson markup.
    const api = window as unknown as { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (range: Range) => unknown };
    if (!api.CSS?.highlights || !api.Highlight) return;
    const walker = document.createTreeWalker(passage.element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0, began = false;
    const from = passage.offset + start, to = from + length;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const end = offset + (node.textContent?.length ?? 0);
      if (!began && from < end) { range.setStart(node, Math.max(0, from - offset)); began = true; }
      if (began && to <= end) { range.setEnd(node, to - offset); api.CSS.highlights.set("mfp-reading", new api.Highlight(range)); return; }
      offset = end;
    }
  }

  useEffect(() => {
    if (state === "idle" || state === "ended") (window.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights?.delete("mfp-reading");
    return () => { (window.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights?.delete("mfp-reading"); };
  }, [state]);

  function read(index: number) {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      setError("Reading aloud is unavailable in this browser. Try a browser with speech support.");
      return;
    }
    const token = ++generation.current;
    synth.cancel();
    // Some browsers retain the paused flag after cancelling speech.
    synth.resume();
    setError("");
    setState("playing");
    function next(i: number) {
      if (token !== generation.current) return;
      const passage = passages.current[i];
      if (!passage) { setState("ended"); return; }
      setPosition(i);
      highlight(passage, 0, passage.text.match(/^\s*\S+/)?.[0].length ?? 1);
      const utterance = new SpeechSynthesisUtterance(silenceEmoji(passage.text));
      utterance.lang = "en-US";
      utterance.rate = TUTOR_READING_RATE;
      utterance.onboundary = event => {
        if (token !== generation.current) return;
        const length = event.charLength || passage.text.slice(event.charIndex).match(/^\S+/)?.[0].length || 1;
        highlight(passage, event.charIndex, length);
      };
      utterance.onend = () => next(i + 1);
      utterance.onerror = () => {
        if (token !== generation.current) return;
        generation.current++;
        setState("paused");
        setError("Reading stopped. Press Play to retry this passage.");
      };
      synth.speak(utterance);
    }
    next(index);
  }

  function stop() {
    generation.current++;
    window.speechSynthesis?.cancel();
    setPosition(0);
    setState("idle");
    setError("");
  }

  function seek(index: number) {
    setPosition(index);
    if (state === "playing") read(index);
    else {
      generation.current++;
      window.speechSynthesis?.cancel();
      setState("paused");
    }
  }

  const control = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
  return <div className="space-y-4">
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4" role="group" aria-label="Textbook listening controls">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!total} className={`${control} bg-primary text-primary-foreground hover:bg-primary/90`} onClick={() => {
          if (state === "playing") {
            // Cancel and restart this passage on Play: reliable across browser speech engines.
            generation.current++;
            window.speechSynthesis?.cancel();
            setState("paused");
          } else read(state === "ended" ? 0 : position);
        }}>{state === "playing" ? <Pause className="h-4 w-4" /> : state === "idle" ? <Volume2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}{state === "playing" ? "Pause" : state === "idle" ? "Listen" : state === "ended" ? "Replay" : "Play"}</button>
        <button type="button" className={control} disabled={!total || position === 0} aria-label="Previous passage" onClick={() => seek(position - 1)}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className={control} disabled={!total || position >= total - 1} aria-label="Next passage" onClick={() => seek(position + 1)}><ChevronRight className="h-4 w-4" /></button>
        <button type="button" className={control} disabled={state === "idle"} aria-label="Stop reading" onClick={stop}><Square className="h-3.5 w-3.5" /></button>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{state === "ended" ? "Finished · " : ""}Passage {total ? position + 1 : 0} / {total}</span>
      </div>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Reading timeline
        <input type="range" aria-label="Reading timeline" aria-valuetext={`Passage ${position + 1} of ${total}`} min={0} max={Math.max(0, total - 1)} step={1} value={position} disabled={!total} onChange={e => seek(Number(e.target.value))} className="mt-2 block h-5 w-full cursor-pointer accent-primary" />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">Drag to a passage or use the arrows. Play resumes at the start of the selected passage.</p>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
    <div ref={content} className="lesson-reading-content rounded-xl border border-border bg-background p-4 shadow-sm sm:p-6 md:p-10">{children}</div>
  </div>;
}
