import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { loadAdminResults } from "@/lib/results-data.server";

vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql: async () => [] }) }));

const { optionalAdmin } = vi.hoisted(() => ({ optionalAdmin: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ getOptionalSupabaseAdmin: optionalAdmin }));

const attempt = { id: "attempt", user_id: "student", quiz_id: "quiz", percent: 100, score: 2, total: 2, passed: true, created_at: "2026-10-27", quizzes: { title: "Test exam", kind: "exam" } };
function context(options: { allowed?: boolean; queryError?: boolean; empty?: boolean; roleError?: boolean } = {}) {
  const replies: Record<string, unknown> = {
    quiz_attempts: { data: options.empty ? [] : [attempt], error: options.queryError ? { message: "private upstream detail" } : null },
    retake_requests: { data: [], error: null },
    profiles: { data: [{ id: "student", username: "Learner" }], error: null },
  };
  const from = vi.fn((table: string) => {
    const chain: any = {};
    for (const method of ["select", "order", "limit", "in"]) chain[method] = vi.fn(() => chain);
    chain.abortSignal = vi.fn(async () => replies[table]);
    return chain;
  });
  const rpc = vi.fn(() => ({ abortSignal: async () => ({ data: options.allowed ?? true, error: options.roleError ? {} : null }) }));
  return { supabase: { from, rpc } as unknown as SupabaseClient<Database>, userId: "admin", from };
}

beforeEach(() => { optionalAdmin.mockReset(); optionalAdmin.mockReturnValue(null); });

describe("administrator result loading", () => {
  it("shows attempts and student names when service credentials are absent", async () => {
    const result = await loadAdminResults(context());
    expect(result.attempts).toEqual([attempt]);
    expect(result.people["student"]).toEqual({ username: "Learner", email: "" });
    expect(result.contactsUnavailable).toBe(true);
  });

  it("denies non-admins before reading records or contacts", async () => {
    const ctx = context({ allowed: false });
    await expect(loadAdminResults(ctx)).rejects.toThrow("Administrator access is required");
    expect(ctx.from).not.toHaveBeenCalled();
    expect(optionalAdmin).not.toHaveBeenCalled();
  });

  it("does not treat failed queries as an empty result set", async () => {
    await expect(loadAdminResults(context({ queryError: true }))).rejects.toThrow("Results could not be loaded");
    expect(optionalAdmin).not.toHaveBeenCalled();
  });

  it("handles genuine empty results without contact lookups", async () => {
    const result = await loadAdminResults(context({ empty: true }));
    expect(result.attempts).toEqual([]);
    expect(result.contactsUnavailable).toBe(false);
    expect(optionalAdmin).not.toHaveBeenCalled();
  });

  it("keeps results visible if contact lookup fails", async () => {
    optionalAdmin.mockReturnValue({ auth: { admin: { getUserById: vi.fn().mockRejectedValue(new Error("private upstream detail")) } } });
    const result = await loadAdminResults(context());
    expect(result.attempts).toHaveLength(1);
    expect(result.people["student"]?.username).toBe("Learner");
    expect(result.contactsUnavailable).toBe(true);
  });

  it("resolves email on the server when administrator access works", async () => {
    const lookup = vi.fn().mockResolvedValue({ data: { user: { email: "learner@example.com" } }, error: null });
    optionalAdmin.mockReturnValue({ auth: { admin: { getUserById: lookup } } });
    const result = await loadAdminResults(context());
    expect(result.people["student"]?.email).toBe("learner@example.com");
    expect(result.contactsUnavailable).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
