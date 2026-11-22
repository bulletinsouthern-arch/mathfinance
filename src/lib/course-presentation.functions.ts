import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { presentationSchema, type CoursePresentation } from "./course-presentation";

export const listCoursePresentation = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("../../db/index");
  const { coursePresentation } = await import("../../db/schema");
  const rows = await db.select().from(coursePresentation);
  return Object.fromEntries(
    rows.map((row) => [row.courseId, presentationSchema.parse(row.details)]),
  ) as Record<string, CoursePresentation>;
});

export const saveCoursePresentation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ courseId: z.string().uuid(), details: presentationSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    const { data: course } = await context.supabase
      .from("courses")
      .select("id")
      .eq("id", data.courseId)
      .maybeSingle();
    if (!course) throw new Error("Course unavailable");
    const { db } = await import("../../db/index");
    const { coursePresentation } = await import("../../db/schema");
    await db
      .insert(coursePresentation)
      .values({ courseId: data.courseId, details: data.details })
      .onConflictDoUpdate({ target: coursePresentation.courseId, set: { details: data.details } });
    return { ok: true };
  });

// Course artwork stays in private object storage; clients retrieve only image bytes.
export const uploadCourseArtwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        content: z.string().max(2_800_000),
        type: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "image/x-icon",
          "image/vnd.microsoft.icon",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    const { getStore } = await import("@netlify/blobs");
    const key = crypto.randomUUID();
    const bytes = Buffer.from(data.content, "base64");
    if (!bytes.length || bytes.length > 2 * 1024 * 1024)
      throw new Error("Image must be under 2 MB");
    await getStore({ name: "course-artwork", consistency: "strong" }).set(key, Uint8Array.from(bytes).buffer, {
      metadata: { contentType: data.type },
    });
    return `course-artwork:${key}`;
  });

export const readCourseArtwork = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getStore } = await import("@netlify/blobs");
    const image = await getStore({ name: "course-artwork", consistency: "strong" }).getWithMetadata(
      data.id,
      { type: "arrayBuffer" },
    );
    if (!image) return null;
    const type = String(image.metadata["contentType"]);
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/x-icon",
        "image/vnd.microsoft.icon",
      ].includes(type)
    )
      return null;
    return `data:${type};base64,${Buffer.from(image.data).toString("base64")}`;
  });
