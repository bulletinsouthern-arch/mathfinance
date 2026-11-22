import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CourseCatalogCard } from "@/components/CourseCatalogCard";
import { CourseAppearance } from "@/components/admin/CourseAppearance";
import { emptyPresentation } from "@/lib/course-presentation";
import {
  listCoursePresentation,
  saveCoursePresentation,
  uploadCourseArtwork,
} from "@/lib/course-presentation.functions";

vi.mock("@/lib/course-presentation.functions", () => ({
  listCoursePresentation: vi.fn(),
  saveCoursePresentation: vi.fn(),
  uploadCourseArtwork: vi.fn(),
}));
vi.mock("@/lib/settings", () => ({ useSiteSettings: () => ({}) }));
vi.mock("@/components/SignedImage", () => ({
  useMediaUrl: (path?: string) => path || null,
  SignedImage: ({ path, alt }: { path: string; alt: string }) => <img src={path} alt={alt} />,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/courses/example">{children}</a>,
}));

const course = {
  id: "course-id",
  subject_id: "subject-id",
  code: "BUS101",
  title: "Business Administration",
  price: 0,
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("opens the course editor from a photo-first card without linking to the student page", () => {
  const edit = vi.fn();
  render(<CourseCatalogCard course={course} onEdit={edit} />);
  expect(screen.getByRole("heading", { name: course.title })).toBeInTheDocument();
  expect(screen.getByText("Free to learn")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: `Edit course: ${course.title}` }));
  expect(edit).toHaveBeenCalledOnce();
});

it("previews an uploaded photo and refreshes the admin card only after saving", async () => {
  const artwork = "course-artwork:ed3334a0-b79e-4ec7-8e0a-2bbfd48fc841";
  let saved = emptyPresentation;
  vi.mocked(listCoursePresentation).mockImplementation(async () => ({ [course.id]: saved }));
  vi.mocked(uploadCourseArtwork).mockResolvedValue(artwork);
  vi.mocked(saveCoursePresentation).mockImplementation(async () => {
    saved = { ...emptyPresentation, cover: artwork };
    return { ok: true };
  });

  function SavedCard() {
    const { data } = useQuery({
      queryKey: ["course-presentation"],
      queryFn: () => listCoursePresentation(),
    });
    return <CourseCatalogCard course={course} details={data?.[course.id]} onEdit={vi.fn()} />;
  }

  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <SavedCard />
      <CourseAppearance courseId={course.id} subjectId={course.subject_id} title={course.title} />
    </QueryClientProvider>,
  );

  const input = await screen.findByLabelText("Course background photo");
  const card = screen.getByRole("article");
  fireEvent.change(input, {
    target: { files: [new File(["image"], "cover.png", { type: "image/png" })] },
  });
  expect(await screen.findByRole("img", { name: "Course background photo" })).toHaveAttribute("src", artwork);
  expect(within(card).queryByRole("presentation")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Save appearance & resources" }));
  await waitFor(() => expect(within(card).getByRole("presentation")).toHaveAttribute("src", artwork));
  expect(saveCoursePresentation).toHaveBeenCalledWith({
    data: { courseId: course.id, details: { ...emptyPresentation, cover: artwork } },
  });
});
