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
