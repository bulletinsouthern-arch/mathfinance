import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Square, Volume2 } from "lucide-react";

type Passage = { text: string; element: HTMLElement };

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
        // Short utterances avoid browser limits on long paragraphs. Keep decimals intact.
        const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const chunks = text.match(/.{1,220}(?:\s|$)|\S{1,220}/g) ?? [];
        return chunks.map(text => ({ text: text.trim(), element })).filter(p => p.text);
      });
    setTotal(passages.current.length);
    return () => { generation.current++; window.speechSynthesis?.cancel(); };
  }, []);

  useEffect(() => {
    if (state === "idle" || state === "ended") return;
    const element = passages.current[position]?.element;
    if (!element) return;
    element.setAttribute("data-reading-active", "true");
    element.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
    return () => element.removeAttribute("data-reading-active");
  }, [position, state]);

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
      const utterance = new SpeechSynthesisUtterance(passage.text);
      utterance.lang = "en-US";
      utterance.rate = 1;
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
    <div className="sticky top-0 z-10 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4" role="group" aria-label="Textbook listening controls">
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
