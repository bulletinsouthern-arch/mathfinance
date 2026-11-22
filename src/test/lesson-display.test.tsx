import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { defaultLessonDisplay, parseBlocks, serializeBlocks, visibleLessonContent } from "@/lib/blocks";
import { youtubeEmbedUrl } from "@/lib/course-presentation";
import { RichContent } from "@/components/RichContent";
vi.mock("@/components/SignedImage", () => ({ SignedImage: ({ path, alt }: {path: string; alt: string}) => <img src={path} alt={alt} /> }));
afterEach(cleanup);
const content = serializeBlocks([
  { id: "text", t: "article", text: "Learn compound interest.", photos: [{ path: "chart.png", caption: "Interest chart" }] },
  { id: "video", t: "video", url: "https://youtu.be/abc12345678", title: "Interest lesson" },
  { id: "photo", t: "photo", path: "table.png", caption: "Rate table" },
]);
it("renders a playable video inside a video-only lesson and keeps the source unchanged", () => {
  render(<RichContent text={content} display={{ text: false, photos: false, videos: true, listen: false }} />);
  expect(screen.getByTitle("Interest lesson")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abc12345678");
  expect(screen.queryByText("Learn compound interest.")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
  expect(parseBlocks(content)).toHaveLength(3);
});
it("keeps inline and standalone photos in photo-only lessons without exposing text or videos", () => {
  render(<RichContent text={content} display={{ text: false, photos: true, videos: false, listen: false }} />);
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.queryByText("Learn compound interest.")).toBeNull();
  expect(screen.queryByTitle("Interest lesson")).toBeNull();
});
it("filters older markdown photos independently from text", () => {
  const old = "## Interest\nMultiply principal by rate.\n![Chart](chart.png)";
  const filtered = visibleLessonContent(old, { ...defaultLessonDisplay, text: false });
  expect(filtered).toContain("![Chart](chart.png)");
  expect(filtered).not.toContain("Multiply principal");
});
it.each(["https://youtube.com/watch?v=abc12345678", "https://youtu.be/abc12345678?t=10", "https://youtube.com/shorts/abc12345678", "https://www.youtube-nocookie.com/embed/abc12345678"])("accepts supported YouTube URLs: %s", url => {
  expect(youtubeEmbedUrl(url)).toBe("https://www.youtube-nocookie.com/embed/abc12345678");
});
it.each(["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=abc12345678", "https://youtube.com/watch?v=bad", "https://example.org/video"])("rejects invalid lesson video URLs: %s", url => {
  expect(youtubeEmbedUrl(url)).toBe("");
});
