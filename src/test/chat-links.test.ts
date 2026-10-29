import { expect, it } from "vitest";
import { stripUnrequestedLinks, wantsLinks } from "@/lib/chat-presentation";

it("removes links the learner did not ask for but keeps the wording", () => {
  const text = "EVA is covered in [this guide](https://example.com/eva). See https://example.com/x for more.\n\nSources:\n- https://example.com/a";
  const out = stripUnrequestedLinks(text);
  expect(out).not.toMatch(/https?:|example\.com/);
  expect(out).toContain("EVA is covered in this guide.");
  expect(out).not.toMatch(/Sources/);
});

it("detects explicit requests for links", () => {
  expect(wantsLinks("Can you give me a link to the source?")).toBe(true);
  expect(wantsLinks("What is economic value added?")).toBe(false);
});
