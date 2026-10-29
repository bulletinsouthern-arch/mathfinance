import { expect, it } from "vitest";
import { buildQuizPrompt, buildStudyPrompt, stripWaitingPlaceholder } from "@/lib/mfp-study";
import { getStudyContext, MFP_STUDY_CONTEXT, type StudyContextRequest } from "@/lib/mfp-bus";

it("requests only the currently supplied lesson and releases it when the page leaves", () => {
  const context = { course: "Business", lesson: "Business goals", content: "Profit is revenue minus costs." };
  const listener = (event: Event) => (event as StudyContextRequest).detail.provide(context);
  window.addEventListener(MFP_STUDY_CONTEXT, listener);
  expect(getStudyContext()).toEqual(context);
  const prompt = buildQuizPrompt({ count: 5, difficulty: "Easy", format: "multiple-choice", context: getStudyContext() });
  expect(prompt).toContain("Profit is revenue minus costs.");
  expect(prompt).toContain("Ask one question per reply");
  expect(prompt).toContain("Question 1 of 5");
  expect(prompt).toContain("not a graded course assessment");
  window.removeEventListener(MFP_STUDY_CONTEXT, listener);
  expect(getStudyContext()).toBeUndefined();
});

it("asks for the subject when there is no lesson context", () => {
  expect(buildStudyPrompt("plan")).toContain("first ask which subject or lesson");
  expect(buildStudyPrompt("plan")).toContain("available study time");
  expect(buildStudyPrompt("coach")).toContain("Wait for my answers");
  expect(buildStudyPrompt("quiz")).toContain("exactly ONE short question");
});

it("bounds long lesson excerpts and discloses omitted content", () => {
  const prompt = buildStudyPrompt("quiz", { course: "Business", lesson: "Goals", content: "x".repeat(30000) });
  expect(prompt.length).toBeLessThan(19000);
  expect(prompt).toContain("Only an excerpt is supplied");
});

it("builds a readiness quiz from a chosen course outline", () => {
  const prompt = buildQuizPrompt({ count: 7, difficulty: "Medium", format: "open-ended", topic: { code: "BUS101", title: "Introduction to Business", units: ["Marketing basics"] } });
  expect(prompt).toContain("BUS101: Introduction to Business");
  expect(prompt).toContain("- Marketing basics");
  expect(prompt).toContain("open-ended");
  expect(prompt).toContain("score out of 7");
});

it("removes waiting placeholders but keeps real questions", () => {
  expect(stripWaitingPlaceholder("(Waiting for your response…)")).toBe("");
  expect(stripWaitingPlaceholder("Which subject would you like?\n\n*Waiting for your reply*")).toBe("Which subject would you like?");
});
