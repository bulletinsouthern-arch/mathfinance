// The Netlify plan record controls server-side access, even on installations
// where the legacy course policy column has not been rolled out yet.
export async function syncCoursePlanProtection(courseId: string, required: boolean) {
  try {
    const { getOptionalSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = getOptionalSupabaseAdmin(AbortSignal.timeout(5000));
    if (!client) return;
    await (client as any).from("courses")
      .update({ paid_plan_required: required }).eq("id", courseId);
  } catch {
    // Do not discard saved prices because an optional legacy service is unavailable.
  }
}
