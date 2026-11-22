import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defaultLessonDisplay } from "./blocks";

const settingsSchema = z.object({
  text: z.boolean(), photos: z.boolean(), videos: z.boolean(), listen: z.boolean(),
}).refine(s => s.text || s.photos || s.videos, "Keep text, photos or videos visible");

export const getSubjectLessonDisplay = createServerFn({ method: "GET" })
  .inputValidator(d => z.object({ subjectId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("../../db/index");
    const { subjectLessonDisplay } = await import("../../db/schema");
    const [row] = await db.select().from(subjectLessonDisplay).where(eq(subjectLessonDisplay.subjectId, data.subjectId));
    return row ? settingsSchema.parse(row.settings) : defaultLessonDisplay;
  });

export const saveSubjectLessonDisplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ subjectId: z.string().uuid(), settings: settingsSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Forbidden");
    const { data: subject, error: subjectError } = await context.supabase.from("subjects").select("id").eq("id", data.subjectId).maybeSingle();
    if (subjectError || !subject) throw new Error("Subject unavailable");
    const { db } = await import("../../db/index");
    const { subjectLessonDisplay } = await import("../../db/schema");
    await db.insert(subjectLessonDisplay).values(data).onConflictDoUpdate({
      target: subjectLessonDisplay.subjectId, set: { settings: data.settings },
    });
    return { ok: true };
  });
