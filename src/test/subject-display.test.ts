import { beforeEach, expect, it, vi } from "vitest";
const { select, insert, rpc, from, write } = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), rpc: vi.fn(), from: vi.fn(), write: vi.fn() }));
vi.mock("../../db/index", () => ({ db: { select, insert } }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let parse = (d: any) => d;
  const chain: any = {
    middleware: () => chain,
    inputValidator: (validator: any) => { parse = validator; return chain; },
    handler: (fn: any) => (args: any) => fn({ ...args, data: parse(args.data) }),
  };
  return chain;
} }));
import { getSubjectLessonDisplay, saveSubjectLessonDisplay } from "@/lib/subject-display.functions";
import { defaultLessonDisplay } from "@/lib/blocks";
const subjectId = "00000000-0000-4000-8000-000000000001";
const settings = { text: false, photos: false, videos: true, listen: false };
const context = { userId: "member", supabase: { rpc, from } };
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: false });
  select.mockReturnValue({ from: () => ({ where: async () => [] }) });
});
it("keeps existing subjects fully visible until an admin saves preferences", async () => {
  await expect(getSubjectLessonDisplay({ data: { subjectId } })).resolves.toEqual(defaultLessonDisplay);
});
it("loads saved subject preferences", async () => {
  select.mockReturnValue({ from: () => ({ where: async () => [{ subjectId, settings }] }) });
  await expect(getSubjectLessonDisplay({ data: { subjectId } })).resolves.toEqual(settings);
});
it("rejects non-admin changes before querying subjects or writing", async () => {
  await expect((saveSubjectLessonDisplay as any)({ context, data: { subjectId, settings } })).rejects.toThrow("Forbidden");
  expect(from).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});
it("saves only the requested subject after checking admin role and subject existence", async () => {
  rpc.mockResolvedValue({ data: true });
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: subjectId } }) };
  from.mockReturnValue(query);
  insert.mockReturnValue({ values: (row: any) => { write(row); return { onConflictDoUpdate: async () => undefined }; } });
  await expect((saveSubjectLessonDisplay as any)({ context, data: { subjectId, settings } })).resolves.toEqual({ ok: true });
  expect(write).toHaveBeenCalledWith({ subjectId, settings });
});
it("rejects missing subjects and does not persist orphaned settings", async () => {
  rpc.mockResolvedValue({ data: true });
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null }) };
  from.mockReturnValue(query);
  await expect((saveSubjectLessonDisplay as any)({ context, data: { subjectId, settings } })).rejects.toThrow("Subject unavailable");
  expect(insert).not.toHaveBeenCalled();
});
it("rejects settings that hide every content type", async () => {
  await expect(Promise.resolve().then(() => (saveSubjectLessonDisplay as any)({ context, data: { subjectId, settings: { text: false, photos: false, videos: false, listen: true } } }))).rejects.toThrow("Keep text, photos or videos visible");
  expect(insert).not.toHaveBeenCalled();
});
