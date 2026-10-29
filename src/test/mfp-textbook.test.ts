import { describe, expect, it } from "vitest";
import { serializeBlocks } from "@/lib/blocks";
import { buildTextbookQuestion, textbookSource, TEXTBOOK_TEACHING_GUIDANCE } from "@/lib/mfp-textbook";

const lesson = { course: "Finance", unit: "Value", lesson: "EVA" };

describe("textbook teaching context", () => {
  it("preserves terms, alternate definitions, formulas, and ordering from editor blocks", () => {
    const source = textbookSource(serializeBlocks([
      { id: "1", t: "article", text: "Alternate definitions state that value is measured differently.\nEVA = NOPAT − WACC × Capital", photos: [] },
      { id: "2", t: "terms", title: "Key terms", items: [{ term: "Economic value added", def: "Profit after the cost of capital." }] },
      { id: "3", t: "photo", path: "private/chart.png", caption: "Capital costs" },
    ]));
    expect(source).toContain("EVA = NOPAT − WACC × Capital");
    expect(source).toContain("Key terms\nEconomic value added: Profit after the cost of capital.");
    expect(source.indexOf("Alternate definitions")).toBeLessThan(source.indexOf("Key terms"));
    expect(source).toContain("Image caption (image not supplied): Capital costs");
    expect(source).not.toContain("private/chart.png");
  });

  it("keeps plain textbook notation intact in the prepared question", () => {
    const content = "## Economic value added\nEVA = NOPAT − WACC × Capital\nAlternate definitions state...";
    expect(buildTextbookQuestion({ ...lesson, content })).toContain(content);
  });

  it("requests complete equation teaching alongside terms in both the question and assistant guidance", () => {
    const question = buildTextbookQuestion({ ...lesson, content: "EVA = NOPAT − WACC × Capital" });
    for (const prompt of [question, TEXTBOOK_TEACHING_GUIDANCE]) {
      expect(prompt).toContain("roadmap");
      expect(prompt).toContain("variable, symbol, operator");
      expect(prompt).toContain("substitutions");
      expect(prompt).toContain("illustrative example");
    }
  });

  it("discloses omitted content and fits the chat transport without cutting the teaching instructions", () => {
    const question = buildTextbookQuestion({ course: "x".repeat(1000), unit: "x".repeat(1000), lesson: "x".repeat(1000), content: "a".repeat(30000) });
    expect(question.length).toBeLessThan(19000);
    expect(question).toContain("rest of the lesson was not supplied");
    expect(question).toContain("Do not just summarize");
  });
});
