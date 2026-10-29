/** Replace emoji with equal-length whitespace so speech boundary offsets stay valid. */
export function silenceEmoji(text: string): string {
  return text.replace(/(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*)*[\u{E0020}-\u{E007F}]*)/gu,
    emoji => " ".repeat(emoji.length));
}

/** Fixed tutor pace; punctuation timing belongs to the device voice. */
export const TUTOR_READING_RATE = 1.3;

const SMALL_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];

function spokenNumber(value: number): string {
  if (value < 20) return SMALL_NUMBERS[value]!;
  return ["", "", "twenty", "thirty", "forty", "fifty"][Math.floor(value / 10)]!
    + (value % 10 ? ` ${SMALL_NUMBERS[value % 10]}` : "");
}

/** Speak explicit clock times conversationally, leaving ratios and durations alone. */
function prepareClockSpeech(text: string): string {
  // A repeated 24-hour / 12-hour clock is one time, not two things to read.
  const deduplicated = text.replace(
    /\b([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?:\s*:\s*[0-5]\d)?\s*(?:PHT\s*)?\(\s*(0?[1-9]|1[0-2])\s*:\s*([0-5]\d)(?:\s*:\s*[0-5]\d)?\s*([AP])\.?\s*M\.?\s*\)/gi,
    (original, hour, minute, repeatedHour, repeatedMinute, period) => {
      const hour24 = Number(repeatedHour) % 12 + (period.toUpperCase() === "P" ? 12 : 0);
      return Number(hour) === hour24 && minute === repeatedMinute
        ? `${repeatedHour}:${repeatedMinute} ${period}M` : original;
    },
  );
  return deduplicated.replace(
    /\b(0?\d|1\d|2[0-3])\s*:\s*([0-5]\d)(?:\s*:\s*[0-5]\d)?\s*(?:([AP])(?:\.\s*M\.?|\s*M)(?!\w)|PHT\b)/gi,
    (original, hour, minute, period) => {
      const h = Number(hour);
      if (period && (h < 1 || h > 12)) return original;
      const m = Number(minute);
      const minutes = m === 0 ? "" : m < 10 ? ` oh ${spokenNumber(m)}` : ` ${spokenNumber(m)}`;
      const meridiem = period ? period.toUpperCase() : h >= 12 ? "P" : "A";
      return `${spokenNumber(h % 12 || 12)}${minutes} ${meridiem} M${period ? "" : " Philippine time"}`;
    },
  );
}

/** Remove visual formatting that device voices can interpret as awkward hesitations.
 * Keep sentence punctuation so faster speech still has natural breathing points.
 * Only use for chat: textbook speech must retain its original highlight offsets.
 */
export function prepareChatSpeech(text: string): string {
  const prose = silenceEmoji(text)
    // Models sometimes wrap ordinary times in LaTeX; unwrap before clock parsing.
    .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\[()[\]]/g, "")
    .replace(/\\(?:quad|qquad|[,;:!])/g, " ")
    .replace(/\\([:/])/g, "$1");
  return prepareClockSpeech(prose)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*(?:[-+*]\s+|#{1,6}\s*|>\s*)/gm, "")
    .replace(/[*#`_~]/g, "")
    // Keep the meaning of numerical division without saying “slash”.
    .replace(/(\d)\s*[/÷]\s*(?=\d)/g, "$1 divided by ")
    .replace(/[\\/|•●▪►]/g, " ")
    .replace(/^\s*[-=─━.]{3,}\s*$/gm, " ")
    .replace(/(?:\.{3,}|…+)/g, ".")
    .replace(/([!?])[!?]+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
}

/** Keep sentences together so the engine can give commas and parentheses natural prosody.
 * Group sentences to avoid repeatedly starting the speech engine mid-thought.
 */
export function speechChunks(text: string): string[] {
  const sentences = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(text), part => part.segment);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    // Exceptionally long sentences still need a limit for browser speech engines.
    const parts = sentence.match(/.{1,900}(?:\s|$)|\S{1,900}/gs) ?? [];
    for (const part of parts) {
      const last = chunks.length - 1;
      if (last >= 0 && chunks[last]!.length + part.length <= 900) chunks[last] += part;
      else chunks.push(part);
    }
  }
  return chunks.filter(chunk => chunk.trim());
}
