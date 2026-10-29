/** Replace emoji with equal-length whitespace so speech boundary offsets stay valid. */
export function silenceEmoji(text: string): string {
  return text.replace(/(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*)*[\u{E0020}-\u{E007F}]*)/gu,
    emoji => " ".repeat(emoji.length));
}

/** Fixed tutor pace; punctuation timing belongs to the device voice. */
export const TUTOR_READING_RATE = 1.6;

/** Remove visual formatting that device voices can interpret as awkward hesitations.
 * Keep sentence punctuation so faster speech still has natural breathing points.
 * Only use for chat: textbook speech must retain its original highlight offsets.
 */
export function prepareChatSpeech(text: string): string {
  return silenceEmoji(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*(?:[-+*]\s+|#{1,6}\s*|>\s*)/gm, "")
    .replace(/[*#`_~]/g, "")
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
