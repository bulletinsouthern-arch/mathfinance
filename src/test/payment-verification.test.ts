import { beforeEach, afterEach, it, expect, vi } from "vitest";
const { sql, from, upsert } = vi.hoisted(() => ({ sql: vi.fn(), from: vi.fn(), upsert: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
import {
  checkoutPaymentMatches,
  confirmCheckout,
  type CheckoutRecord,
} from "@/lib/payment-verification.server";
const receipt: CheckoutRecord = {
  id: "receipt",
  user_id: "student",
  course_id: "course",
  provider_id: "cs_verified",
  amount_centavos: 25000,
  plan: "monthly",
};
const checkout = () => ({
  id: receipt.provider_id,
  attributes: {
    reference_number: "student:course:receipt",
    payments: [{ attributes: { status: "paid", currency: "PHP", amount: 25000 } }],
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  sql.mockResolvedValue([{ expires_at: "2026-12-01" }]);
  upsert.mockResolvedValue({});
  from.mockImplementation(() => {
    const q: any = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { enabled: true, secret_key: "placeholder" } }),
      upsert,
    };
    return q;
  });
});
afterEach(() => vi.unstubAllGlobals());
it("requires paid status, exact currency, amount, checkout and owner reference", () => {
  expect(checkoutPaymentMatches(checkout(), receipt)).toBe(true);
  for (const attributes of [
    { status: "pending" },
    { status: "failed" },
    { amount: 24999 },
    { currency: "USD" },
  ]) {
    const c = checkout();
    Object.assign(c.attributes.payments[0]!.attributes, attributes);
    expect(checkoutPaymentMatches(c, receipt)).toBe(false);
  }
  const other = checkout();
  other.attributes.reference_number = "attacker:course:receipt";
  expect(checkoutPaymentMatches(other, receipt)).toBe(false);
  expect(checkoutPaymentMatches({ ...checkout(), id: "other" }, receipt)).toBe(false);
  expect(
    checkoutPaymentMatches({ id: receipt.provider_id, attributes: { status: "active" } }, receipt),
  ).toBe(false);
});
it("never grants access for a pending payment returned by the provider", async () => {
  const c = checkout();
  c.attributes.payments[0]!.attributes.status = "pending";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: c }) }));
  expect(await confirmCheckout(receipt)).toBe(false);
  expect(sql).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
});
it("reconciles a paid checkout and retries enrollment syncing without extending access twice", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: checkout() }) }),
  );
  upsert.mockResolvedValueOnce({ error: { message: "offline" } }).mockResolvedValue({});
  await expect(confirmCheckout(receipt)).rejects.toThrow("Enrollment is syncing");
  expect(await confirmCheckout(receipt)).toBe(true);
  const mutation = sql.mock.calls[0]![0].join("");
  expect(mutation).toContain("paid_at IS NULL");
  expect(upsert).toHaveBeenLastCalledWith(
    expect.objectContaining({ payment_verified: true, user_id: "student", course_id: "course" }),
    expect.anything(),
  );
});
it("does not grant access when the provider request fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(confirmCheckout(receipt)).rejects.toThrow("temporarily unavailable");
  expect(sql).not.toHaveBeenCalled();
});
