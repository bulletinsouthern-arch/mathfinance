import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { Courses, Route as CoursesRoute } from "@/routes/courses.index";

const { courses } = vi.hoisted(() => ({
  courses: [
    {
      id: "finance",
      title: "Finance Basics",
      code: "FIN101",
      description: "Learn about cash flows",
      subject_id: "business",
      price: 0,
    },
    {
      id: "statistics",
      title: "Intro to Statistics",
      code: "STAT101",
      description: null,
      subject_id: "math",
      price: 0,
    },
  ],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: () => ({ order: async () => ({ data: courses }) }) }),
  },
}));
vi.mock("@/lib/course-presentation.functions", () => ({
  listCoursePresentation: async () => ({}),
}));
vi.mock("@/lib/settings", () => ({ useSiteSettings: () => ({}) }));
vi.mock("@/lib/use-library", () => ({ useLibrary: () => ({ categories: [], posts: [] }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({}) }));
vi.mock("@/components/CourseCatalogCard", () => ({
  CourseCatalogCard: ({ course }: { course: (typeof courses)[number] }) => <h2>{course.title}</h2>,
}));

afterEach(cleanup);

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
const home = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Courses });
const formulas = createRoute({
  getParentRoute: () => rootRoute,
  path: "/formulas",
  validateSearch: (search: Record<string, unknown>) => search,
  component: () => <h1>Formula Library</h1>,
});
const courseRouteOptions = {
  ...CoursesRoute.options,
  getParentRoute: () => rootRoute,
  path: "/courses/",
};
const routeTree = rootRoute.addChildren([home, formulas, CoursesRoute.update(courseRouteOptions)]);

function mount(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

it.each([" fIn101 ", "finance basics", "cash flows"])(
  "finds courses from Home for %j",
  async (query) => {
    const router = mount("/");
    await screen.findByRole("heading", { name: "Intro to Statistics" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search courses" }), {
      target: { value: query },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find courses" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/courses"));
    expect(router.state.location.search["q"]).toBe(query.trim());
    expect(screen.getByRole("heading", { name: "Finance Basics" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Intro to Statistics" })).not.toBeInTheDocument();
  },
);

it("shows no courses for an unmatched term and clears the filter without showing formulas", async () => {
  mount("/courses?q=quadratic");
  expect(await screen.findByRole("heading", { name: "No courses found" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search courses" })).toHaveValue("quadratic");
  fireEvent.click(screen.getByRole("link", { name: "Clear search" }));
  expect(await screen.findByRole("heading", { name: "Intro to Statistics" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search courses" })).toHaveValue("");
});

it("keeps header searches in the Formula Library when browsing formulas", async () => {
  const router = mount("/formulas");
  await screen.findByRole("heading", { name: "Formula Library" });
  fireEvent.change(screen.getByRole("searchbox", { name: "Search formulas" }), {
    target: { value: "quadratic" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find formulas" }));
  await waitFor(() => expect(router.state.location.search["q"]).toBe("quadratic"));
  expect(router.state.location.pathname).toBe("/formulas");
});
