import { describe, expect, it } from "vitest";
import { generatedQuestions } from "@/lib/generated-questions";

describe("AI question validation", () => {
  const mcq = { qtype: "mcq", question: "Working capital equals?", a: "Current assets minus current liabilities", b: "Revenue", c: "Profit", d: "Equity", correct: "a" };
  it("accepts a mix of MCQ and open questions", () => {
    expect(generatedQuestions.parse({ questions: [mcq, { qtype: "open", question: "Explain liquidity", answer: "Ability to meet short-term obligations" }] }).questions).toHaveLength(2);
  });
  it("rejects missing keys, incomplete options, and invalid correct answers", () => {
    for (const q of [{ ...mcq, correct: "e" }, { ...mcq, a: "" }, { qtype: "open", question: "Explain" }]) {
      expect(generatedQuestions.safeParse({ questions: [q] }).success).toBe(false);
    }
  });
  it("rejects empty batches and oversized batches", () => {
    expect(generatedQuestions.safeParse({ questions: [] }).success).toBe(false);
    expect(generatedQuestions.safeParse({ questions: Array(101).fill(mcq) }).success).toBe(false);
  });
});
