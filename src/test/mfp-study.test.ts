import { expect, it } from "vitest";
import { buildStudyPrompt } from "@/lib/mfp-study";
import { getStudyContext, MFP_STUDY_CONTEXT, type StudyContextRequest } from "@/lib/mfp-bus";

it("requests only the currently supplied lesson and releases it when the page leaves", () => {
  const context = { course: "Business", lesson: "Business goals", content: "Profit is revenue minus costs." };
  const listener = (event: Event) => (event as StudyContextRequest).detail.provide(context);
  window.addEventListener(MFP_STUDY_CONTEXT, listener);
  expect(getStudyContext()).toEqual(context);
  const prompt = buildStudyPrompt("quiz", getStudyContext());
  expect(prompt).toContain("Profit is revenue minus costs.");
  expect(prompt).toContain("one question at a time");
  expect(prompt).toContain("not a graded course assessment");
  window.removeEventListener(MFP_STUDY_CONTEXT, listener);
  expect(getStudyContext()).toBeUndefined();
});

it("asks for the subject when there is no lesson context", () => {
  expect(buildStudyPrompt("plan")).toContain("first ask which subject or lesson");
  expect(buildStudyPrompt("plan")).toContain("available study time");
  expect(buildStudyPrompt("coach")).toContain("Wait for my answers");
});

it("bounds long lesson excerpts and discloses omitted content", () => {
  const prompt = buildStudyPrompt("quiz", { course: "Business", lesson: "Goals", content: "x".repeat(30000) });
  expect(prompt.length).toBeLessThan(19000);
  expect(prompt).toContain("Only an excerpt is supplied");
});
