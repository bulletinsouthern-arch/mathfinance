import { expect, it } from "vitest";
import { prepareChatSpeech, silenceEmoji, speechChunks } from "@/lib/reading-pace";

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


it("removes visual hesitations while keeping natural punctuation and math", () => {
  expect(prepareChatSpeech("## Let's solve it…\n\n- **Start** with 3.14 (pi), then multiply.\n- Profit = 12 − 3 × 2!!! ✅"))
    .toBe("Let's solve it. Start with 3.14 (pi), then multiply. Profit = 12 − 3 × 2!");
  expect(prepareChatSpeech("Read [this example](https://example.com).\n\nThen continue."))
    .toBe("Read this example. Then continue.");
});

it("reads duplicate clock formats once without seconds or colon names", () => {
  expect(prepareChatSpeech("It is 19\u202f:\u202f09\u202f:\u202f50\u202f\u202fPHT (7\u202f:\u202f09\u202f:\u202f50\u202fPM)."))
    .toBe("It is seven oh nine P M.");
  expect(prepareChatSpeech("00:00:30 PHT (12:00:30 AM)"))
    .toBe("twelve A M");
  expect(prepareChatSpeech("12:30 PHT (12:30 PM)"))
    .toBe("twelve thirty P M");
});

it("phrases explicit times naturally and preserves mathematical notation and durations", () => {
  expect(prepareChatSpeech("Meet at 7:09:50 PM, then 8:00 a.m. tomorrow."))
    .toBe("Meet at seven oh nine P M, then eight A M tomorrow.");
  expect(prepareChatSpeech("It is 19 : 45 : 50 PHT."))
    .toBe("It is seven forty five P M Philippine time.");
  expect(prepareChatSpeech("Ratio 3:09, duration 00:09:50, value 3.14 (pi)."))
    .toBe("Ratio 3:09, duration 00:09:50, value 3.14 (pi).");
  expect(prepareChatSpeech("19:09 PHT (8:09 PM)"))
    .toBe("seven oh nine P M Philippine time (eight oh nine P M)");
});

it("unwraps formatted clock times before speech and skips decorative symbols", () => {
  expect(prepareChatSpeech(String.raw`🕒 It's \(19\,:\,13\,:\,50\;\text{PHT}\) (7:13:50 PM). ✅`))
    .toBe("It's seven thirteen P M.");
  expect(prepareChatSpeech("**It's 7:13 p.m.** ✨ / | •"))
    .toBe("It's seven thirteen P M");
  expect(prepareChatSpeech("Read / listen. 12 / 3 = 4. Value: 3.14."))
    .toBe("Read listen. 12 divided by 3 = 4. Value: 3.14.");
});
