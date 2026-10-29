/** Everyday conversation needs a direct answer, not a second model round trip. */
export const CONCISE_REPLY_GUIDANCE = "Answer professionally and directly. Default to a short-to-medium reply: about 40–100 words for an ordinary explanation, and one sentence for a simple fact or greeting. Use only the detail needed to answer the actual question. Do not add a roadmap, recap, unsolicited examples, follow-up questions or long lists by default. Use a longer answer only for genuinely complex work or when the learner explicitly requests detail. For calculations, silently check your reasoning and show the essential steps and result. Keep complete sentences; never sacrifice accuracy for brevity.";

export function needsDetailedReply(text: string): boolean {
  return text.length > 2500 || /\b(in detail|detailed|comprehensive|thorough|step.by.step|derive|derivation|prove|proof|audit|complex|multi.step|full (?:lesson|explanation|report)|teach me this textbook|complete.*document)\b/i.test(text);
}

export function needsLiveLookup(text: string, now = new Date()): boolean {
  // Roll forward automatically: a year-specific question must not silently use
  // training knowledge for the current year, recent years or future plans.
  if ([...text.matchAll(/\b(20\d{2})\b/g)].some((match) => Number(match[1]) >= now.getUTCFullYear() - 1)) return true;
  return /\b(latest\w*|current|today|tonight|now|news|recent|newest|live|weather|forecast|price|stock|exchange rate|net\s*worth|richest|billionaires?|election|president|prime minister|officeholder|ceo|champion|winner|release|version|schedule|score|results?|who (?:is|runs|leads|owns)|law|regulation|sources?|references?|links?|urls?|websites?|search|look up|verify|fact.check|recheck|wrong|incorrect|ngayon|balita|pinakabago)\b/i.test(text);
}
