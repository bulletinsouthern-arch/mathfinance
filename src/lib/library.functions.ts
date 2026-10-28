import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formulaPostSchema } from "./content-schema";
export const listLibrary = createServerFn({ method: "GET" }).handler(async () => {
  const { getDatabase } = await import("@netlify/database");
  const db = getDatabase();
  const [categories, posts] = await Promise.all([
    db.sql`SELECT id::float8 AS id,name,blurb FROM formula_categories ORDER BY id`,
    db.sql`SELECT * FROM formula_posts ORDER BY category,name`,
  ]);
  return {
    categories: categories as { id: number; name: string; blurb: string }[],
    overriddenIds: posts.map((p) => String(p["id"])),
    posts: posts.filter((p) => p["published"]) as import("./content-schema").LibraryPost[],
  };
});
export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.number().int().min(24).max(Number.MAX_SAFE_INTEGER),
        name: z.string().trim().min(1).max(200),
        blurb: z.string().max(2000).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    const { getDatabase } = await import("@netlify/database");
    await getDatabase()
      .sql`INSERT INTO formula_categories (id,name,blurb) VALUES (${data.id},${data.name},${data.blurb}) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,blurb=EXCLUDED.blurb`;
    return { ok: true };
  });
export const saveFormulaPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => formulaPostSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    const { getDatabase } = await import("@netlify/database");
    const id = data.id || crypto.randomUUID();
    await getDatabase()
      .sql`INSERT INTO formula_posts (id,category,name,expression,description,published) VALUES (${id},${data.category},${data.name},${data.expression},${data.description},${data.published}) ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,name=EXCLUDED.name,expression=EXCLUDED.expression,description=EXCLUDED.description,published=EXCLUDED.published,updated_at=now()`;
    return { id };
  });
export const adminFormulaPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Forbidden");
    const { getDatabase } = await import("@netlify/database");
    return (await getDatabase()
      .sql`SELECT * FROM formula_posts ORDER BY updated_at DESC`) as import("./content-schema").LibraryPost[];
  });
