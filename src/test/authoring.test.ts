import { beforeEach, describe, expect, it, vi } from "vitest";
const { sql, runChat } = vi.hoisted(() => ({ sql: vi.fn(), runChat: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/lib/ai.functions", () => ({ runChat }));
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
      handler: (h: any) => (args: any) => h({ ...args, data: parse(args?.data) }),
    };
    return chain;
  },
}));
import {
  generateAdminContent,
  getQuizQuestions,
  saveQuizQuestions,
} from "@/lib/authoring.functions";
import { saveCategory, saveFormulaPost, listLibrary } from "@/lib/library.functions";
import { evaluateEquation } from "@/lib/equation";
const quizId = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const q = {
  id,
  quiz_id: quizId,
  question: "What is 2 + 2?",
  option_a: "1",
  option_b: "2",
  option_c: "3",
  option_d: "4",
  correct_option: "d",
  qtype: "mcq",
  answer_key: "4",
  sort_order: 0,
};
function context(admin = true) {
  return { userId: "owner", supabase: { rpc: async () => ({ data: admin, error: null }) } };
}
beforeEach(() => {
  sql.mockReset();
  sql.mockResolvedValue([]);
  runChat.mockReset();
});
describe("admin publishing", () => {
  it("rejects public users before AI calls or writes", async () => {
    await expect(
      (generateAdminContent as any)({
        data: { kind: "formula", prompt: "Post a formula" },
        context: context(false),
      }),
    ).rejects.toThrow("Forbidden");
    expect(sql).not.toHaveBeenCalled();
    expect(runChat).not.toHaveBeenCalled();
  });
  it("accepts a category numbered one million", async () => {
    await (saveCategory as any)({ data: { id: 1000000, name: "Physics" }, context: context() });
    expect(sql.mock.calls[0]!.slice(1)).toEqual([1000000, "Physics", ""]);
  });
  it("rejects unsafe calculator text before storage", async () => {
    expect(() =>
      (saveFormulaPost as any)({
        data: { category: "24", name: "Unsafe", expression: 'alert("x")' },
        context: context(),
      }),
    ).toThrow();
    expect(sql).not.toHaveBeenCalled();
  });
  it("does not expose answer keys to students", async () => {
    sql.mockResolvedValue([{ questions: [q] }]);
    const result = await (getQuizQuestions as any)({ data: { quizId }, context: context(false) });
    expect(result[0].question).toBe(q.question);
    expect(result[0]).not.toHaveProperty("answer_key");
    expect(result[0]).not.toHaveProperty("correct_option");
  });
  it("checks the admin flag on question reads", async () => {
    await expect(
      (getQuizQuestions as any)({ data: { quizId, admin: true }, context: context(false) }),
    ).rejects.toThrow("Forbidden");
    expect(sql).not.toHaveBeenCalled();
  });
  it("saves drafts without replacing published questions", async () => {
    sql.mockResolvedValueOnce([{ questions: [q] }]);
    await (saveQuizQuestions as any)({
      data: { quizId, questions: [{ ...q, question: "Edited" }], publish: false },
      context: context(),
    });
    const call = sql.mock.calls[1]!;
    expect(call[0].join("")).toContain("DO UPDATE SET draft=");
    expect(call.slice(1).map(String).join(" ")).toContain("Edited");
  });
  it("rejects incomplete generated batches without publishing", async () => {
    runChat.mockResolvedValue({ ok: true, reply: JSON.stringify({ questions: [q] }) });
    await expect(
      (generateAdminContent as any)({
        data: { kind: "questions", quizId, prompt: "Two questions", count: 2 },
        context: context(),
      }),
    ).resolves.toHaveProperty("error");
    expect(sql).not.toHaveBeenCalled();
  });
  it("publishes generated questions and matching editable drafts", async () => {
    runChat.mockResolvedValue({ ok: true, reply: JSON.stringify({ questions: [q] }) });
    sql.mockResolvedValueOnce([{ questions: [] }]);
    await (generateAdminContent as any)({
      data: { kind: "questions", quizId, prompt: "One question", count: 1 },
      context: context(),
    });
    const call = sql.mock.calls[1]!;
    expect(call[0].join("")).toContain("questions=EXCLUDED.questions,draft=EXCLUDED.draft");
    expect(call[2]).toEqual(call[3]);
  });
  it("excludes formula draft content from public responses", async () => {
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id, published: false, name: "Private draft" }]);
    const result = await (listLibrary as any)({});
    expect(result.posts).toEqual([]);
    expect(result.overriddenIds).toEqual([id]);
  });
  it("evaluates scientific functions without executing code", () => {
    expect(evaluateEquation("sin(0) + cos(0) + floor(2.8)", {})).toBe(3);
  });
});

it("accepts open answers with null multiple-choice fields", async () => {
  runChat.mockResolvedValue({
    ok: true,
    reply: JSON.stringify({
      questions: [
        {
          ...q,
          qtype: "open",
          answer_key: "4",
          correct_option: null,
          option_a: null,
          option_b: null,
          option_c: null,
          option_d: null,
        },
      ],
    }),
  });
  sql.mockResolvedValueOnce([{ questions: [] }]);
  const result = await (generateAdminContent as any)({
    data: { kind: "questions", quizId, prompt: "One open question", count: 1 },
    context: context(),
  });
  expect(result.message).toContain("1 questions published");
  expect(runChat.mock.calls[0]![2].json).toBe(true);
});
it("returns actionable AI failures without writing", async () => {
  runChat.mockResolvedValue({
    ok: false,
    error: "AI is rate limited. Wait briefly before retrying.",
  });
  const result = await (generateAdminContent as any)({
    data: { kind: "formula", prompt: "Post" },
    context: context(),
  });
  expect(result.error).toContain("rate limited");
  expect(sql).not.toHaveBeenCalled();
});
it("rejects a missing quiz before calling AI", async () => {
  const result = await (generateAdminContent as any)({
    data: { kind: "questions", prompt: "Post" },
    context: context(),
  });
  expect(result.error).toContain("Choose a quiz");
  expect(runChat).not.toHaveBeenCalled();
});
it("reports malformed JSON without publishing", async () => {
  runChat.mockResolvedValue({ ok: true, reply: '{"questions":[' });
  const result = await (generateAdminContent as any)({
    data: { kind: "questions", quizId, prompt: "Post" },
    context: context(),
  });
  expect(result.error).toContain("incomplete JSON");
  expect(sql).not.toHaveBeenCalled();
});
