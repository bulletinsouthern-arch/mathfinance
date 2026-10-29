/** Remove machine references without removing useful mathematical brackets. */
export function stripChatCitations(text: string): string {
  return text.replace(/【[^】]*】/g, "");
}

/** Normalize explicit clocks; unmarked ratios and durations retain their meaning. */
export function normalizeChatTimes(text: string): string {
  return text.replace(
    /\b([01]?\d|2[0-3])(?:\s*:\s*([0-5]\d)(?:\s*:\s*[0-5]\d)?)?\s*([AP])(?:\.\s*M\.?|\s*M)(?!\w)/gi,
    (_match, hour: string, minute: string | undefined, period: string) => {
      const h = Number(hour);
      const meridiem = h === 0 ? "AM" : h > 12 ? "PM" : `${period.toUpperCase()}M`;
      return `${h % 12 || 12}${minute && minute !== "00" ? `:${minute}` : ""} ${meridiem}`;
    },
  );
}

/** True when the learner explicitly asked for links, URLs or sources. */
export function wantsLinks(text: string): boolean {
  return /\b(links?|urls?|sources?|references?|websites?|site|webpage)\b/i.test(text);
}

/** Drop URLs and Markdown links the learner did not ask for, keeping the link text. */
export function stripUnrequestedLinks(text: string): string {
  return text
    .replace(/!?\[([^\]\n]*)\]\((?:https?:\/\/|www\.)[^)\s]*(?:\s+"[^"]*")?\)/gi, "$1")
    .replace(/<(?:https?:\/\/|www\.)[^>\s]+>/gi, "")
    .replace(/\(\s*(?:https?:\/\/|www\.)[^\s)]+\s*\)/gi, "")
    .replace(/(?:https?:\/\/|www\.)[^\s<>()]*[^\s<>().,;:!?'"]/gi, "")
    .replace(/^[ \t]*(?:[-*]|\d+\.)?[ \t]*(?:\*\*)?(?:sources?|references?|links?|further reading)(?:\*\*)?:?(?:\*\*)?[ \t]*$/gim, "")
    .replace(/^[ \t]*(?:[-*]|\d+\.)[ \t]*$/gm, "")
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
