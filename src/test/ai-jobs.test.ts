import { beforeEach, describe, expect, it, vi } from "vitest";
const { sql, query, release, prepare } = vi.hoisted(() => ({
  sql: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ sql, pool: { connect: async () => ({ query, release }) } }),
}));
vi.mock("@/lib/authoring.functions", () => ({ prepareAdminContent: prepare }));
vi.mock("@/lib/question-data.server", () => ({ readQuestions: async () => [] }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (d: any) => d;
    const chain: any = {
      middleware: () => chain,
      inputValidator: (v: any) => {
        parse = v;
        return chain;
      },
      handler: (h: any) => (a: any) => h({ ...a, data: parse(a.data) }),
    };
    return chain;
  },
}));
import { aiPublishJob } from "@/lib/ai-jobs.functions";
const id = "00000000-0000-4000-8000-000000000001";
const quizId = "00000000-0000-4000-8000-000000000002";
const context = (admin = true) => ({
  userId: id,
  supabase: { rpc: async () => ({ data: admin }) },
});
const run = (data: any, admin = true) =>
  (aiPublishJob as any)({ data: { quizId, ...data }, context: context(admin) });
const job = (questions: any[] = [], total = 100) => ({
  id,
  quiz_id: quizId,
  prompt: "Make 100 questions",
  total,
  questions,
  published: false,
});
beforeEach(() => {
  vi.clearAllMocks();
  sql.mockReset();
  query.mockReset();
  prepare.mockReset();
});
describe("saved AI commands", () => {
  it("checks admin authorization before reading saved commands", async () => {
    await expect(run({ action: "load" }, false)).rejects.toThrow("Forbidden");
    expect(sql).not.toHaveBeenCalled();
  });
  it("restores the command and progress without exposing answer keys", async () => {
    sql.mockResolvedValueOnce([job([{ question: "one", correct_option: "a" }])]);
    const saved = await run({ action: "load" });
    expect(saved).toMatchObject({ total: 100, progress: 1, prompt: "Make 100 questions" });
    expect(saved.questions).toBeUndefined();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("resumes question 51 of 100 and checkpoints with a compare-and-swap", async () => {
    const questions = Array.from({ length: 50 }, (_, i) => ({ question: `Question ${i}` }));
    sql
      .mockResolvedValueOnce([job(questions)])
      .mockResolvedValueOnce([job([...questions, { question: "next" }])]);
    prepare.mockResolvedValueOnce({ questions: [{ question: "next" }] });
    expect(await run({ action: "step", id })).toMatchObject({ progress: 51, published: false });
    expect(prepare.mock.calls[0]![0].data).toMatchObject({
      count: 1,
      offset: 50,
      total: 100,
      singleAttempt: true,
    });
    expect(sql.mock.calls[1]![0].join("")).toContain("jsonb_array_length(questions)=");
    expect(query).not.toHaveBeenCalled();
  });
  it("preserves progress after an AI timeout", async () => {
    sql.mockResolvedValueOnce([job([{ question: "saved" }])]);
    prepare.mockResolvedValueOnce({ error: "AI timed out" });
    expect(await run({ action: "step", id })).toMatchObject({ progress: 1, error: "AI timed out" });
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("publishes only a complete set in the same transaction as marking the job complete", async () => {
    sql.mockResolvedValueOnce([job([{ question: "complete" }], 1)]);
    query.mockImplementation(async (text: string) => ({
      rows: text.startsWith("SELECT published")
        ? [{ published: false }]
        : text.startsWith("SELECT questions")
          ? [{ questions: [{ question: "existing" }] }]
          : [],
    }));
    expect(await run({ action: "step", id })).toMatchObject({ published: true, progress: 1 });
    const statements = query.mock.calls.map((call) => call[0]);
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    const update = query.mock.calls.find((call) =>
      call[0].startsWith("UPDATE quiz_question_edits"),
    );
    expect(JSON.parse(update![1][1]).map((q: any) => q.question)).toEqual(["existing", "complete"]);
    expect(release).toHaveBeenCalled();
  });
  it("does not append again when a lost response is retried after publication", async () => {
    sql.mockResolvedValueOnce([{ ...job([{}], 1), published: true }]);
    expect(await run({ action: "step", id })).toMatchObject({ published: true });
    expect(query).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });
});
