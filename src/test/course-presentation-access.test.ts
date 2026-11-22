import { beforeEach, expect, it, vi } from "vitest";
const { insert, write, rpc, from, blobSet } = vi.hoisted(() => ({
  insert: vi.fn(),
  write: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  blobSet: vi.fn(),
}));
vi.mock("../../db/index", () => ({ db: { insert } }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({ set: blobSet }) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (d: any) => d;
    const chain: any = {
      middleware: () => chain,
      inputValidator: (validator: any) => {
        parse = validator;
        return chain;
      },
      handler: (handler: any) => (args: any) => handler({ ...args, data: parse(args.data) }),
    };
    return chain;
  },
}));
import { saveCoursePresentation, uploadCourseArtwork } from "@/lib/course-presentation.functions";
const courseId = "00000000-0000-4000-8000-000000000001";
const context = { userId: "member", supabase: { rpc, from } };
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: false });
});
it("rejects non-admin appearance edits before touching storage", async () => {
  await expect(
    (saveCoursePresentation as any)({
      context,
      data: { courseId, details: { sponsor: "Changed" } },
    }),
  ).rejects.toThrow("Forbidden");
  expect(from).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});
it("rejects non-admin artwork uploads before touching object storage", async () => {
  await expect(
    (uploadCourseArtwork as any)({ context, data: { content: "aGVsbG8=", type: "image/png" } }),
  ).rejects.toThrow("Forbidden");
  expect(blobSet).not.toHaveBeenCalled();
});
it("saves appearance only after verifying admin role and course existence", async () => {
  rpc.mockResolvedValue({ data: true });
  const query: any = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { id: courseId } }),
  };
  from.mockReturnValue(query);
  insert.mockReturnValue({
    values: (row: any) => {
      write(row);
      return { onConflictDoUpdate: async () => undefined };
    },
  });
  await expect(
    (saveCoursePresentation as any)({ context, data: { courseId, details: { sponsor: "MFP" } } }),
  ).resolves.toEqual({ ok: true });
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({ courseId, details: expect.objectContaining({ sponsor: "MFP" }) }),
  );
});
