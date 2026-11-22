import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/course-presentation.functions", () => ({ uploadCourseArtwork: upload }));
vi.mock("@/components/SignedImage", () => ({ SignedImage: ({ path, alt }: { path: string; alt: string }) => <img src={path} alt={alt} /> }));
import { BlockEditor } from "@/components/admin/BlockEditor";
import { parseBlocks, serializeBlocks } from "@/lib/blocks";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("adds, previews and serializes a YouTube video without requiring embed HTML", () => {
  const onChange = vi.fn();
  render(<BlockEditor value="" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /V · YouTube video/ }));
  fireEvent.change(screen.getByPlaceholderText("https://www.youtube.com/watch?v=…"), { target: { value: "https://youtu.be/abc12345678" } });
  expect(screen.getByTitle("Lesson video preview")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abc12345678");
  const latest = onChange.mock.calls.at(-1)![0];
  expect(parseBlocks(latest).at(-1)).toMatchObject({ t: "video", url: "https://youtu.be/abc12345678" });
  fireEvent.change(screen.getByPlaceholderText("https://www.youtube.com/watch?v=…"), { target: { value: "https://example.com" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Paste a valid YouTube");
});
it("replaces an existing lesson photo through the upload control", async () => {
  upload.mockResolvedValue("course-artwork:replacement");
  const onChange = vi.fn();
  const { container } = render(<BlockEditor value={serializeBlocks([{ id: "photo", t: "photo", path: "old.png", caption: "Original chart" }])} onChange={onChange} />);
  expect(screen.getByText("Replace photo")).toBeInTheDocument();
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["image"], "chart.png", { type: "image/png" })] } });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(parseBlocks(onChange.mock.calls.at(-1)![0])).toEqual([{ id: "photo", t: "photo", path: "course-artwork:replacement", caption: "Original chart" }]);
});
