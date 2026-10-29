import { expect, it } from "vitest";
import { silenceEmoji } from "@/lib/reading-pace";

it("silences emoji sequences while preserving lesson highlight offsets and mathematics", () => {
  const original = "Hi 👩🏽‍🏫 🇵🇭 1️⃣ ❤️ ✅! Profit = 12 − 3 × 2.";
  const spoken = silenceEmoji(original);
  expect(spoken).not.toMatch(/👩|🏽|🇵|1️⃣|❤|✅/u);
  expect(spoken.length).toBe(original.length);
  expect(spoken.indexOf("Profit")).toBe(original.indexOf("Profit"));
  expect(spoken).toContain("Profit = 12 − 3 × 2.");
});
