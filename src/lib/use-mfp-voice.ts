import { useEffect, useRef, useState } from "react";
import { silenceEmoji, speechChunks, TUTOR_READING_RATE } from "./reading-pace";

type Recognition = {
  lang: string; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function useMfpVoice(active: boolean, onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const activeRef = useRef(active);
  activeRef.current = active;
  const generation = useRef(0);
  const recognition = useRef<Recognition | null>(null);
  const transcript = useRef(onTranscript);
  transcript.current = onTranscript;
  function stop() {
    generation.current++;
    window.speechSynthesis?.cancel();
    setSpeaking(false); setPaused(false);
  }
  useEffect(() => {
    const synth = window.speechSynthesis;
    setSupported(!!synth && typeof SpeechSynthesisUtterance !== "undefined");
    const w = window as VoiceWindow;
    setMicSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    const update = () => setVoices(synth?.getVoices() ?? []);
    update(); synth?.addEventListener("voiceschanged", update);
    return () => { generation.current++; synth?.cancel(); recognition.current?.abort(); synth?.removeEventListener("voiceschanged", update); };
  }, []);
  useEffect(() => { if (!active) { stop(); recognition.current?.abort(); } }, [active]);
  function speak(text: string) {
    if (!activeRef.current) return;
    stop(); setError("");
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") { setError("Voice is unavailable here. You can read the answer below."); return; }
    recognition.current?.abort();
    // Read prose rather than Markdown punctuation or URL destinations.
    const plain = silenceEmoji(text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[*#`_~]/g, "");
    const chunks = speechChunks(plain);
    const token = generation.current;
    setSpeaking(true); synth.resume();
    if (!chunks.length) { setSpeaking(false); return; }
    // Queue ahead: the next passage is ready before the current one ends.
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.voice = voices.find(v => v.voiceURI === voice) ?? voices.find(v => v.lang.startsWith("en") && v.localService) ?? voices.find(v => v.lang.startsWith("en") && v.default) ?? voices.find(v => v.lang.startsWith("en")) ?? null;
      u.lang = u.voice?.lang ?? "en-US";
      u.rate = TUTOR_READING_RATE;
      u.onend = () => {
        if (token === generation.current && i === chunks.length - 1) { setSpeaking(false); setPaused(false); }
      };
      u.onerror = () => { if (token === generation.current) { stop(); setError("Voice stopped. Try Listen again. You can also read the answer."); } };
      synth.speak(u);
    });
  }

  function microphone() {
    if (listening) { recognition.current?.abort(); return; }
    stop(); setError("");
    const w = window as VoiceWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    const r = new Constructor(); recognition.current = r;
    r.lang = "en-US"; r.interimResults = false;
    r.onresult = e => transcript.current(Array.from(e.results).map(result => result[0]?.transcript ?? "").join(" "));
    r.onerror = e => { setListening(false); setError(e.error === "not-allowed" ? "Microphone permission was denied. You can type your question instead." : "Could not hear your question. Try again or type it."); };
    r.onend = () => setListening(false);
    try { r.start(); setListening(true); } catch { setError("Microphone unavailable. Type your question instead."); }
  }
  function togglePause() {
    if (paused) window.speechSynthesis?.resume(); else window.speechSynthesis?.pause();
    setPaused(!paused);
  }
  return { supported, micSupported, voices, voice, setVoice, speaking, paused, listening, error, speak, stop, microphone, togglePause };
}
