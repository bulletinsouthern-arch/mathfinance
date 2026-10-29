import { expect, it } from "vitest";
import { needsDetailedReply, needsLiveLookup } from "@/lib/mfp-response-policy";

it("keeps everyday questions brief while allowing explicit depth", () => {
  expect(needsDetailedReply("What is a stakeholder?")).toBe(false);
  expect(needsDetailedReply("Explain this calculation step by step.")).toBe(true);
  expect(needsDetailedReply("Give a detailed comparison of these business plans.")).toBe(true);
});

it("retains live checks for changing facts and explicit source requests", () => {
  for (const question of ["What is the latest news?", "Who is the president?", "What is the exchange rate today?", "Find sources for this claim", "Your answer is wrong, recheck"]) expect(needsLiveLookup(question)).toBe(true);
  expect(needsLiveLookup("What is revenue?")).toBe(false);
});

it("checks explicit years automatically as the calendar advances", () => {
  for (const question of ["Tell me about technology in 2026", "What happens in 2027?", "Who runs Apple?", "What version of Python is available?"]) {
    expect(needsLiveLookup(question, new Date("2026-10-29T12:00:00Z"))).toBe(true);
  }
  expect(needsLiveLookup("Developments in 2028", new Date("2028-06-01T00:00:00Z"))).toBe(true);
  expect(needsLiveLookup("Explain the events of 1990", new Date("2028-06-01T00:00:00Z"))).toBe(false);
});
