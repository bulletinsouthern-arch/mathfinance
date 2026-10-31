import { beforeEach, afterEach, it, expect, vi } from "vitest";
const { sql, from } = vi.hoisted(() => ({ sql: vi.fn(), from: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/payment-gateway.server", () => ({
  readPaymentGateway: async () => (await from("payment_settings").select().eq().maybeSingle()).data,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://example.test/checkout"),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (d: any) => d;
    const c: any = {
      middleware: () => c,
      inputValidator: (v: any) => {
        parse = v;
        return c;
      },
      handler: (h: any) => (a: any) => h({ ...a, data: parse(a.data) }),
    };
    return c;
  },
}));
vi.mock("@/lib/course-access.server", () => ({
  readCourseAccess: vi.fn().mockResolvedValue({ allowed: false, paid: true }),
}));
import {
  createCourseCheckout,
  paymentGatewayStatus,
  courseReceipts,
} from "@/lib/paymongo.functions";
const courseId = "00000000-0000-4000-8000-000000000001";
function setup(enabled = true, methods: string[] | null = ["card", "gcash", "qrph"]) {
  from.mockImplementation((table: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({
        data:
          table === "courses"
            ? { id: courseId, subject_id: "subject", title: "Course", price: 0 }
            : table === "payment_settings"
              ? { enabled, secret_key: "test-placeholder" }
              : null,
      }),
    };
    return q;
  });
  sql
    .mockResolvedValueOnce([{ monthly: 250, yearly: 2400 }])
    .mockResolvedValueOnce(methods ? [{ methods }] : [])
    .mockResolvedValueOnce([{ id: "receipt" }])
    .mockResolvedValue([]);
}
beforeEach(() => {
  sql.mockReset();
  from.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it("charges the full yearly price up front using server-side pricing", async () => {
  setup();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { id: "checkout", attributes: { checkout_url: "https://pay.example.test" } },
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await (createCourseCheckout as any)({
    data: { courseId, plan: "yearly" },
    context: { userId: "student", supabase: { from } },
  });
  expect(result.ok).toBe(true);
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.data.attributes.line_items[0].amount).toBe(240000);
  expect(body.data.attributes.payment_method_types).toContain("qrph");
  expect(body.data.attributes.success_url).toContain("?paid=receipt");
  expect(body.data.attributes.reference_number).toBe(`student:${courseId}:receipt`);
});
it("keeps paid courses unavailable when PayMongo is not configured", async () => {
  setup(false);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const result = await (createCourseCheckout as any)({
    data: { courseId, plan: "monthly" },
    context: { userId: "student", supabase: { from } },
  });
  expect(result).toMatchObject({
    ok: false,
    error: "Payment gateway access unavailable. PayMongo has not been set up yet.",
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it("returns only gateway availability without exposing credentials", async () => {
  setup(true);
  expect(await (paymentGatewayStatus as any)({ context: {} })).toEqual({
    available: true,
    webhookReady: false,
  });
});
it("reports an unconfigured gateway as unavailable", async () => {
  setup(false);
  expect(await (paymentGatewayStatus as any)({ context: {} })).toEqual({
    available: false,
    webhookReady: false,
  });
});

it("prevents charging a customer again while paid access is active", async () => {
  setup();
  const { readCourseAccess } = await import("@/lib/course-access.server");
  vi.mocked(readCourseAccess).mockResolvedValueOnce({
    allowed: true,
    paid: true,
    monthly: 250,
    yearly: 2400,
    expiresAt: "2027-01-01",
  });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const result = await (createCourseCheckout as any)({
    data: { courseId, plan: "monthly" },
    context: { userId: "student", supabase: { from } },
  });
  expect(result.ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not expose or reconcile another customer's receipt", async () => {
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  const result = await (courseReceipts as any)({
    data: { courseId, checkoutId: courseId },
    context: { userId: "student", supabase: { from } },
  });
  expect(result).toEqual([]);
  expect(sql.mock.calls[0]!.slice(1)).toEqual([courseId, "student", courseId]);
  expect(sql.mock.calls[1]!.slice(1)).toEqual(["student", courseId]);
});

it("still lists saved receipts when PayMongo reconciliation fails", async () => {
  setup();
  sql.mockReset();
  const checkout = {
    id: courseId,
    user_id: "student",
    course_id: courseId,
    provider_id: "cs_test",
    amount_centavos: 25000,
    plan: "monthly",
    paid_at: null,
  };
  const paid = {
    id: "receipt",
    plan: "monthly",
    amount_centavos: 25000,
    provider_id: "cs_old",
    paid_at: "2026-10-01",
    expires_at: null,
  };
  sql.mockResolvedValueOnce([checkout]).mockResolvedValueOnce([paid]);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await (courseReceipts as any)({
    data: { courseId, checkoutId: courseId },
    context: { userId: "student", supabase: { from } },
  });
  expect(result).toEqual([
    {
      id: "receipt",
      plan: "monthly",
      amountCentavos: 25000,
      reference: "cs_old",
      paidAt: "2026-10-01",
      expiresAt: null,
    },
  ]);
});

it("reports a PayMongo connection failure without throwing a generic gateway error", async () => {
  setup();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  const result = await (createCourseCheckout as any)({
    data: { courseId, plan: "monthly" },
    context: { userId: "student", supabase: { from } },
  });
  expect(result).toMatchObject({
    ok: false,
    error: "PayMongo did not respond. Please retry opening checkout.",
  });
});

it("explains rejected keys without exposing the provider's raw response", async () => {
  setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ errors: [{ detail: "private provider response" }] }),
    }),
  );
  const result = await (createCourseCheckout as any)({
    data: { courseId, plan: "monthly" },
    context: { userId: "student", supabase: { from } },
  });
  expect(result).toMatchObject({
    ok: false,
    error:
      "PayMongo rejected the secret key. Ask the administrator to update it in payment settings.",
  });
});

it.each([
  { saved: null, expected: ["card", "gcash", "qrph", "paymaya", "grab_pay", "dob", "dob_ubp"] },
  { saved: ["qrph", "gcash"], expected: ["qrph", "gcash"] },
  {
    saved: ["card", "gcash", "qrph", "paymaya", "grab_pay", "dob", "dob_ubp"],
    expected: ["card", "gcash", "qrph", "paymaya", "grab_pay", "dob", "dob_ubp"],
  },
])(
  "offers all methods by default and honors saved merchant selections: $saved",
  async ({ saved, expected }) => {
    setup(true, saved);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: "checkout", attributes: { checkout_url: "https://pay.example.test" } },
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await (createCourseCheckout as any)({
      data: { courseId, plan: "monthly" },
      context: { userId: "student", supabase: { from } },
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).data.attributes.payment_method_types).toEqual(
      expected,
    );
  },
);
