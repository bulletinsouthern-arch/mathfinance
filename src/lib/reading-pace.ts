/** Replace emoji with equal-length whitespace so speech boundary offsets stay valid. */
export function silenceEmoji(text: string): string {
  return text.replace(/(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*)*[\u{E0020}-\u{E007F}]*)/gu,
    emoji => " ".repeat(emoji.length));
}
