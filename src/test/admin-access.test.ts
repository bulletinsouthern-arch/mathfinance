import { beforeEach, expect, it, vi } from "vitest";
const { from, listUsers, requireProctor, query, release } = vi.hoisted(() => ({ from: vi.fn(), listUsers: vi.fn(), requireProctor: vi.fn(), query: vi.fn(), release: vi.fn() }));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ pool: { connect: async () => ({ query, release }) } }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from, auth: { admin: { listUsers } } } }));
vi.mock("@/lib/proctor.server", () => ({ requireProctor }));
import { changeAdministrator, listAdministrators } from "@/lib/admin-access.server";
let ids: string[];
let deletes: string[];
let grants: string[];
let failGrant = false;
const context = { userId: "first", supabase: {} };
beforeEach(() => {
  vi.clearAllMocks(); ids = ["first"]; deletes = []; grants = []; failGrant = false;
  requireProctor.mockResolvedValue(undefined);
  query.mockResolvedValue({});
  listUsers.mockResolvedValue({ data: { users: [{ id: "second", email: "replacement@example.test" }] } });
  from.mockImplementation((table: string) => {
    let removing = false;
    const q: any = {
      select: () => q,
      eq: (key: string, value: string) => {
        if (removing && key === "user_id") deletes.push(value);
        return q;
      },
      in: async () => ({ data: [{ id: "first", username: "original-admin" }] }),
      upsert: async (row: any) => {
        if (failGrant) return { error: new Error("offline") };
        grants.push(row.user_id); ids.push(row.user_id); return {};
      },
      delete: () => { removing = true; return q; },
      then: (resolve: any) => resolve({ data: table === "user_roles" ? ids.map((user_id) => ({ user_id })) : [], error: null }),
    };
    return q;
  });
});
it("refuses to remove the last administrator", async () => {
  await expect(changeAdministrator(context, { action: "remove", userId: "first" })).rejects.toThrow("last one");
  expect(deletes).toEqual([]); expect(release).toHaveBeenCalled();
});
it("grants replacement access before removing the original, including self-replacement", async () => {
  expect(await changeAdministrator(context, { action: "replace", userId: "first", email: "Replacement@example.test" })).toMatchObject({ selfRemoved: true });
  expect(grants).toEqual(["second"]); expect(deletes).toEqual(["first"]);
  expect(query.mock.calls[1]![0]).toContain("pg_advisory_xact_lock");
});
it("keeps original access when the replacement grant fails", async () => {
  failGrant = true;
  await expect(changeAdministrator(context, { action: "replace", userId: "first", email: "replacement@example.test" })).rejects.toThrow("Could not grant");
  expect(deletes).toEqual([]);
});
it("removes admin access without deleting the account", async () => {
  ids.push("second");
  await changeAdministrator(context, { action: "remove", userId: "second" });
  expect(deletes).toEqual(["second"]); expect(listUsers).not.toHaveBeenCalled();
});
it("rejects unauthorized changes before accessing account data", async () => {
  requireProctor.mockRejectedValue(new Error("Forbidden"));
  await expect(changeAdministrator(context, { action: "add", email: "replacement@example.test" })).rejects.toThrow("Forbidden");
  expect(from).not.toHaveBeenCalled();
});
it("lists usernames without sending account emails to the browser", async () => {
  expect(await listAdministrators(context)).toEqual([{ id: "first", username: "original-admin", current: true }]);
  expect(listUsers).not.toHaveBeenCalled();
});
