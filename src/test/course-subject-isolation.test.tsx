import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("@/components/admin/CoursePlans", () => ({ CoursePlans: () => null }));
vi.mock("@/components/admin/QuizBuilder", () => ({ QuestionEditor: () => null }));
vi.mock("@/components/admin/BlockEditor", () => ({ BlockEditor: () => null }));
vi.mock("@/lib/unit-numbers.functions", () => ({ listUnitNumbers: async () => ({}), saveUnitNumber: vi.fn() }));
import { CourseBuilder } from "@/components/admin/CourseBuilder";
const subjects = [{ id: "boxing", name: "Boxing", description: "", sort_order: 0 }, { id: "business", name: "Business", description: "", sort_order: 1 }];
const courses = subjects.map((s) => ({ id: `${s.id}-course`, subject_id: s.id, title: `${s.name} sample`, code: "", price: 0, description: "", sort_order: 0 }));
function mount() {
  from.mockImplementation((table: string) => {
    let courseId = "";
    const q: any = {
      select: () => q,
      eq: (key: string, value: string) => { if (key === "id") courseId = value; return q; },
      order: async () => ({ data: table === "subjects" ? subjects : table === "courses" ? courses : [] }),
      maybeSingle: async () => ({ data: courses.find((c) => c.id === courseId) }),
    };
    return q;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CourseBuilder /></QueryClientProvider>);
}
afterEach(cleanup);
it("does not offer Boxing as a subject when editing Business, including after switching courses", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /Boxing sample/ }));
  await screen.findByDisplayValue("Boxing sample");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: /Business sample/ }));
  const title = await screen.findByDisplayValue("Business sample");
  const editor = title.closest(".space-y-6")! as HTMLElement;
  const options = within(editor).getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual(["Business", "+ New subject…"]);
});
it("starts a new course with its own subject instead of offering subjects from other courses", async () => {
  mount();
  await screen.findByRole("button", { name: /Business sample/ });
  fireEvent.click(screen.getByRole("button", { name: "New course" }));
  const input = await screen.findByPlaceholderText("New subject name");
  const editor = input.closest(".space-y-6")! as HTMLElement;
  expect(within(editor).getAllByRole("option").map((o) => o.textContent)).toEqual(["+ New subject…"]);
});
