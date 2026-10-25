import { describe, expect, it } from "vitest";
import { gradeQuiz, type QuizQuestion } from "@/lib/quiz";

const qs: QuizQuestion[] = [
  { id: "q1", question: "2+2?", option_a: "3", option_b: "4", option_c: "5", option_d: "6", correct_option: "b" },
  { id: "q2", question: "Capital of France?", option_a: "London", option_b: "Rome", option_c: "Paris", option_d: "Berlin", correct_option: "c" },
];

describe("gradeQuiz", () => {
  it("marks the admin-set correct letter green and others wrong", () => {
    const r = gradeQuiz(qs, { q1: "b", q2: "a" }, 70);
    expect(r.results.q1).toBe(true);
    expect(r.results.q2).toBe(false);
    expect(r.score).toBe(1);
    expect(r.total).toBe(2);
  });

  it("passes at exactly the pass percent and fails below it", () => {
    expect(gradeQuiz(qs, { q1: "b", q2: "c" }, 100).passed).toBe(true);
    expect(gradeQuiz(qs, { q1: "b", q2: "a" }, 70).passed).toBe(false);
    expect(gradeQuiz(qs, { q1: "b", q2: "a" }, 50).passed).toBe(true);
  });

  it("computes the percentage shown to the student", () => {
    expect(gradeQuiz(qs, { q1: "b", q2: "c" }, 70).percent).toBe(100);
    expect(gradeQuiz(qs, { q1: "x", q2: "y" }, 70).percent).toBe(0);
  });
});
