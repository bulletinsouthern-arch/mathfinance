import { expect, it } from "vitest";
import { silenceEmoji, speechChunks } from "@/lib/reading-pace";

it("silences emoji sequences while preserving lesson highlight offsets and mathematics", () => {
  const original = "Hi 👩🏽‍🏫 🇵🇭 1️⃣ ❤️ ✅! Profit = 12 − 3 × 2.";
  const spoken = silenceEmoji(original);
  expect(spoken).not.toMatch(/👩|🏽|🇵|1️⃣|❤|✅/u);
  expect(spoken.length).toBe(original.length);
  expect(spoken.indexOf("Profit")).toBe(original.indexOf("Profit"));
  expect(spoken).toContain("Profit = 12 − 3 × 2.");
});

it("keeps punctuation, decimals and parenthetical phrases together", () => {
  const text = "Start with 3.14 (the approximate value of pi), then multiply. Continue with the result. ".repeat(30);
  const chunks = speechChunks(text);
  expect(chunks.join("")).toBe(text);
  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    expect(chunk.length).toBeLessThanOrEqual(900);
    expect(chunk.trimEnd()).toMatch(/[.!?]$/);
  }
});
