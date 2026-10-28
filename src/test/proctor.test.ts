import { beforeEach, afterEach, expect, it, vi } from "vitest";
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/lib/server-env.server", () => ({ getServerEnv: () => undefined }));
import { pollRoom, signalRoom, enforceDepartures, checkVision } from "@/lib/proctor.server";
function context(allowed = true) {
  const settings = {
    select: () => settings,
    in: () =>
      Promise.resolve({
        data: [
          { key: "ai_model", value: "configured-vision-model" },
          { key: "ai_key", value: "test-only-placeholder" },
        ],
      }),
  };
  return {
    userId: "student",
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: allowed, error: null }),
      from: () => settings,
    },
  };
}
beforeEach(() => sql.mockReset().mockResolvedValue([]));
afterEach(() => vi.unstubAllGlobals());
it("rejects nonadministrators before listing rooms, receiving signals, or analyzing camera samples", async () => {
  await expect(pollRoom(context(false), { after: 0 })).rejects.toThrow("Forbidden");
  await expect(
    checkVision(context(false), { attemptId: "foreign", image: "frame" }),
  ).rejects.toThrow("Forbidden");
  expect(sql).toHaveBeenCalledTimes(1);
});
it("rejects a foreign attempt before reading its messages", async () => {
  sql.mockResolvedValue([]);
  await expect(pollRoom(context(), { attemptId: "foreign", after: 0 })).rejects.toThrow(
    "Forbidden",
  );
  expect(sql).toHaveBeenCalledTimes(1);
});
it("prevents students from initiating feeds or issuing proctor commands", async () => {
  sql.mockResolvedValue([{ user_id: "student" }]);
  await expect(
    signalRoom(context(), {
      attemptId: "attempt",
      to: "other-student",
      body: { type: "offer", connection: "id" },
    }),
  ).rejects.toThrow("Forbidden");
  expect(sql).toHaveBeenCalledTimes(1);
});
it("prevents students from sending answers to another student", async () => {
  sql.mockResolvedValue([{ user_id: "student" }]);
  await expect(
    signalRoom(context(false), {
      attemptId: "attempt",
      to: "other-student",
      body: { type: "answer", connection: "id" },
    }),
  ).rejects.toThrow("Forbidden");
  expect(sql).toHaveBeenCalledTimes(1);
});
it("checks suspension before clearing an overdue departure on return", async () => {
  sql
    .mockResolvedValueOnce([{ id: "attempt" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ session_id: "attempt", user_id: "student", suspended_at: "now" }])
    .mockResolvedValueOnce([]);
  const result = await pollRoom(context(), { attemptId: "attempt", after: 0, focused: true });
  expect(result.rooms[0]?.suspended).toBe(true);
  expect(sql.mock.calls[1]![0].join("")).toContain("interval '20 seconds'");
  expect(sql.mock.calls[2]![0].join("")).toContain("away_since=CASE");
});
it("atomically suspends once for 14 days using server time and an authenticated account scope", async () => {
  sql.mockResolvedValue([]);
  await enforceDepartures("student");
  const [query, ...params] = sql.mock.calls[0]!;
  expect(query.join("")).toContain("suspended_at IS NULL");
  expect(query.join("")).toContain("interval '14 days'");
  expect(query.join("")).toContain("ON CONFLICT DO NOTHING");
  expect(params).toEqual(["student", "student"]);
});
it("reports an unsupported Ollama model without creating visual flags or suspensions", async () => {
  sql.mockResolvedValue([{ session_id: "attempt" }]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  const result = await checkVision(context(), { attemptId: "attempt", image: "frame" });
  expect(result.state).toBe("unavailable");
  expect(result.message).not.toMatch(/ollama|model|api/i);
  expect(sql.mock.calls.some((call) => call[0].join("").includes("vision_away_since=NULL"))).toBe(
    true,
  );
  expect(
    sql.mock.calls.some((call) => call[0].join("").includes("INSERT INTO assessment_suspensions")),
  ).toBe(false);
});
it.each([
  { presence: "unknown", confidence: 1 },
  { presence: "absent", confidence: 0.5 },
  { presence: "present", confidence: 0.99 },
])("resets the visual interval on uncertain or present observations: %j", async (observation) => {
  sql.mockResolvedValue([{ session_id: "attempt" }]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: JSON.stringify(observation) } }),
    }),
  );
  await checkVision(context(), { attemptId: "attempt", image: "frame" });
  expect(sql.mock.calls.some((call) => call[0].join("").includes("INSERT INTO assessment_suspensions"))).toBe(false);
  expect(sql.mock.calls.some((call) => call[0].join("").includes("vision_away_since=NULL"))).toBe(
    true,
  );
});
it("suspends sustained confident camera-absence observations after 20 seconds without a warning strike", async () => {
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ session_id: "attempt" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "attempt" }]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"presence":"absent","confidence":0.99}' } }),
    }),
  );
  const result = await checkVision(context(), { attemptId: "attempt", image: "frame" });
  expect(result.state).toBe("flagged");
  expect(sql.mock.calls[1]![0].join("")).toContain("interval '12 seconds'");
  const query = sql.mock.calls[3]![0].join("");
  expect(query).toContain("interval '20 seconds'");
  expect(query).toContain("suspended_at IS NULL");
  expect(query).toContain("assessment_suspensions");
  expect(query).not.toContain("warning_count=");
  expect(sql.mock.calls.flat().includes("frame")).toBe(false);
});

it("runs the scheduled fallback and expires signaling without reading media", async () => {
  const { default: monitor } = await import("../../my_functions/exam-monitor.mts");
  sql.mockResolvedValue([]);
  const response = await monitor();
  expect(response.status).toBe(204);
  expect(sql.mock.calls).toHaveLength(2);
  expect(sql.mock.calls[0]![0].join("")).toContain("interval '20 seconds'");
  expect(sql.mock.calls[1]![0].join("")).toContain("DELETE FROM exam_live_signals");
});

it("does not sample or suspend a completed attempt from a stale dashboard feed", async () => {
  sql.mockResolvedValue([]);
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const result=await checkVision(context(),{attemptId:"completed",image:"frame"});
  expect(result.state).toBe("unknown");
  expect(fetcher).not.toHaveBeenCalled();
  expect(sql.mock.calls[1]?.[0].join("")).toContain("s.result IS NULL");
});
