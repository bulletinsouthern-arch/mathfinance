import { describe, expect, it } from "vitest";
import { courseEmbedUrl, presentationSchema, safeCourseUrl } from "@/lib/course-presentation";

describe("course resource URLs", () => {
  it("embeds ordinary HTTPS resources and converts common video links", () => {
    expect(courseEmbedUrl("https://lessons.example.org/introduction?part=2")).toBe(
      "https://lessons.example.org/introduction?part=2",
    );
    expect(courseEmbedUrl("https://www.youtube.com/watch?v=abc-123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc-123",
    );
    expect(courseEmbedUrl("https://youtu.be/abc-123?t=10")).toBe(
      "https://www.youtube-nocookie.com/embed/abc-123",
    );
    expect(courseEmbedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.org",
    "//example.org",
    "https://name:password@example.org",
  ])("rejects unsafe resource URLs: %s", (value) => {
    expect(safeCourseUrl(value)).toBe("");
    expect(courseEmbedUrl(value)).toBe("");
    expect(presentationSchema.safeParse({ embedUrl: value }).success).toBe(false);
    expect(presentationSchema.safeParse({ sponsorUrl: value }).success).toBe(false);
  });
  it("allows clearing optional metadata without inventing course claims", () => {
    const parsed = presentationSchema.parse({});
    expect(parsed.sponsor).toBe("");
    expect(parsed.outcomes).toBe("");
    expect(parsed.embedUrl).toBe("");
    expect(presentationSchema.safeParse({ skills: "a".repeat(2001) }).success).toBe(false);
  });
});
