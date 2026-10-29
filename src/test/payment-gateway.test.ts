import { beforeEach, expect, it, vi } from "vitest";
const { sql, from } = vi.hoisted(() => ({ sql: vi.fn(), from: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
import { readPaymentGateway, syncPaymentGateway } from "@/lib/payment-gateway.server";
beforeEach(() => {
  vi.resetAllMocks();
});
it("uses private runtime settings without requiring legacy administrator credentials", async () => {
  sql.mockResolvedValue([{ secret_key: "placeholder", enabled: true }]);
  expect(await readPaymentGateway()).toMatchObject({ enabled: true });
  expect(from).not.toHaveBeenCalled();
});
it("honors a disabled runtime configuration without falling back to older enabled settings", async () => {
  sql.mockResolvedValue([{ enabled: false, secret_key: "" }]);
  expect(await readPaymentGateway()).toMatchObject({ enabled: false });
  expect(from).not.toHaveBeenCalled();
});
it("preserves existing merchant settings until synchronization", async () => {
  sql.mockResolvedValue([]);
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: { enabled: true } }),
  };
  from.mockReturnValue(q);
  expect(await readPaymentGateway()).toEqual({ enabled: true });
});
it("does not replace working credentials when the administrator settings read fails", async () => {
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ error: {} }) };
  from.mockReturnValue(q);
  await expect(syncPaymentGateway({ from })).rejects.toThrow("Could not read payment settings");
  expect(sql).not.toHaveBeenCalled();
});
it("synchronizes disabling payments as well as enabling them", async () => {
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: { enabled: false, secret_key: "placeholder" } }),
  };
  from.mockReturnValue(q);
  await syncPaymentGateway({ from });
  expect(sql.mock.calls[0]!.slice(1)).toEqual(["placeholder", "", false]);
});
