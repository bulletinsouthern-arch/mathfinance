import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const administrators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAdministrators } = await import("./admin-access.server");
    return listAdministrators(context);
  });

export const updateAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.discriminatedUnion("action", [
    z.object({ action: z.literal("add"), email: z.string().trim().email().max(254) }),
    z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
    z.object({ action: z.literal("replace"), userId: z.string().uuid(), email: z.string().trim().email().max(254) }),
  ]).parse(d))
  .handler(async ({ data, context }) => {
    const { changeAdministrator } = await import("./admin-access.server");
    return changeAdministrator(context, data);
  });

export const addAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(254) }).parse(d))
  .handler(async ({ data, context }) => {
    const { changeAdministrator } = await import("./admin-access.server");
    return changeAdministrator(context, { action: "add", email: data.email });
  });
