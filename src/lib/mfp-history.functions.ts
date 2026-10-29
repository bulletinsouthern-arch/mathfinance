import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const message = z.object({
  role: z.enum(["user", "assistant"]), content: z.string().max(120000),
  display: z.string().max(1000).optional(), quiz: z.enum(["multiple-choice", "open-ended"]).optional(),
});
const chat = z.object({ id: z.string().uuid(), title: z.string().max(100), msgs: z.array(message).max(200) });

export const mfpHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.discriminatedUnion("action", [
    z.object({ action: z.literal("load") }),
    z.object({ action: z.literal("save"), chat }),
    z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  ]).parse(input))
  .handler(async ({ data, context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.action === "save") {
      await db.sql`INSERT INTO mfp_chat_history(user_id,id,title,messages)
        VALUES(${context.userId},${data.chat.id},${data.chat.title},${JSON.stringify(data.chat.msgs)}::jsonb)
        ON CONFLICT(user_id,id) DO UPDATE SET title=EXCLUDED.title,messages=EXCLUDED.messages,updated_at=now()`;
      return [];
    }
    if (data.action === "delete") {
      await db.sql`DELETE FROM mfp_chat_history WHERE user_id=${context.userId} AND id=${data.id}`;
      return [];
    }
    const rows = await db.sql`SELECT id,title,messages FROM mfp_chat_history WHERE user_id=${context.userId} ORDER BY updated_at DESC LIMIT 50`;
    return rows.map((row) => chat.parse({ id: row['id'], title: row['title'], msgs: row['messages'] }));
  });
