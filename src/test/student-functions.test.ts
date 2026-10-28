import { beforeEach, describe, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain: any = { middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn };
  return chain;
} }));
import { examDraft, updateStudentName } from "@/lib/student.functions";
import { listProctorFrames, sendProctorFrame } from "@/lib/proctor.functions";

const userId = "10000000-0000-4000-8000-000000000001";
const quizId = "20000000-0000-4000-8000-000000000001";
const invoke = (fn: unknown, args: unknown) => (fn as (a: unknown) => Promise<any>)(args);
beforeEach(() => { sql.mockReset(); sql.mockResolvedValue([]); });

describe("student database ownership", () => {
  it("loads a draft only for the authenticated user and quiz", async () => {
    sql.mockResolvedValue([{ answers: { question: "a" } }]);
    expect(await invoke(examDraft, { context: { userId }, data: { quizId } })).toEqual({ question: "a" });
    expect(sql.mock.calls[0]?.slice(1)).toEqual([userId, quizId]);
  });
  it("saves and clears drafts with ownership enforced by the session", async () => {
    await invoke(examDraft, { context: { userId }, data: { quizId, answers: { question: "b" }, userId: "spoofed" } });
    expect(sql.mock.calls[0]?.slice(1)).toEqual([userId, quizId, '{"question":"b"}']);
    await invoke(examDraft, { context: { userId }, data: { quizId, clear: true } });
    expect(sql.mock.calls[1]?.slice(1)).toEqual([userId, quizId]);
  });
  it("updates only the signed-in student's legal name", async () => {
    await invoke(updateStudentName, { context: { userId }, data: { first_name: "Ada", last_name: "Lovelace", userId: "spoofed" } });
    expect(sql.mock.calls[0]?.slice(1)).toEqual([userId, "Ada", "Lovelace"]);
  });
});

describe("proctor feed access", () => {
  it("denies non-admins before querying snapshots", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(invoke(listProctorFrames, { context: { userId, supabase: { rpc } } })).rejects.toThrow("Administrator access required");
    expect(sql).not.toHaveBeenCalled();
  });
  it("denies access when role verification fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: {} });
    await expect(invoke(listProctorFrames, { context: { userId, supabase: { rpc } } })).rejects.toThrow();
    expect(sql).not.toHaveBeenCalled();
  });
  it("overrides a forged frame owner with the authenticated owner", async () => {
    await invoke(sendProctorFrame, { context: { userId }, data: { name: "Ada", userId: "spoofed" } });
    expect(sql.mock.calls[1]?.[1]).toBe(userId);
    expect(JSON.parse(sql.mock.calls[1]?.[2]).userId).toBe(userId);
  });
});
