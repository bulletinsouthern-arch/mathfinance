import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const frame = z.string().max(300000).regex(/^(data:image\/jpeg;base64,[A-Za-z0-9+/=]+)?$/);
export const sendProctorFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({
    clear: z.boolean().optional(), name: z.string().max(220).default("Student"), exam: z.string().max(500).optional(),
    frame: frame.default(""), screenFrame: frame.default(""), warnings: z.number().int().min(0).default(0),
    fullscreen: z.boolean().default(false), focused: z.boolean().default(false), mic: z.boolean().default(false),
    answered: z.number().int().min(0).default(0), total: z.number().int().min(0).default(0),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.clear) {
      await db.sql`DELETE FROM mfp.proctor_frames WHERE user_id = ${context.userId}::uuid`;
      return { ok: true };
    }
    const payload = { ...data, userId: context.userId, at: Date.now() };
    await db.sql`DELETE FROM mfp.proctor_frames WHERE updated_at < now() - interval '30 seconds'`;
    await db.sql`INSERT INTO mfp.proctor_frames (user_id, payload) VALUES (${context.userId}::uuid, ${JSON.stringify(payload)}::jsonb) ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
    return { ok: true };
  });

export const listProctorFrames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Administrator access required.");
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    await db.sql`DELETE FROM mfp.proctor_frames WHERE updated_at < now() - interval '30 seconds'`;
    const rows = await db.sql`SELECT payload FROM mfp.proctor_frames WHERE updated_at > now() - interval '10 seconds' LIMIT 300`;
    return rows.map(row => row["payload"]);
  });
