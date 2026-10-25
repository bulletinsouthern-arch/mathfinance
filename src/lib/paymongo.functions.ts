import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Creates a PayMongo checkout session for a paid course and returns the
// URL the student is sent to. Keys come from the admin payment settings.
export const createCourseCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("id, subject_id, code, title, price")
      .eq("id", data.courseId)
      .maybeSingle();
    if (!course) return { ok: false as const, error: "Course not found" };
    if (!(Number(course.price) > 0)) return { ok: false as const, error: "This course is free — just enroll." };

    const { data: existing } = await supabaseAdmin
      .from("enrollments")
      .select("id")
      .eq("user_id", context.userId)
      .eq("course_id", course.id)
      .maybeSingle();
    if (existing) return { ok: false as const, error: "You are already enrolled." };

    const { data: pay } = await supabaseAdmin
      .from("payment_settings")
      .select("secret_key, enabled")
      .eq("provider", "paymongo")
      .maybeSingle();
    if (!pay?.enabled || !pay.secret_key)
      return { ok: false as const, error: "Payments are not set up yet. Please try again later." };

    const origin = new URL(getRequest().url).origin;
    const courseUrl = `${origin}/courses/${course.subject_id}/${course.id}`;
    const amountCentavos = Math.round(Number(course.price) * 100);

    const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${pay.secret_key}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: `${course.code ? `${course.code}: ` : ""}${course.title}`,
                amount: amountCentavos,
                currency: "PHP",
                quantity: 1,
              },
            ],
            payment_method_types: ["card", "gcash", "paymaya", "grab_pay"],
            success_url: `${courseUrl}?paid=1`,
            cancel_url: courseUrl,
            reference_number: `${context.userId}:${course.id}`,
            description: "Course enrollment — Math & Finance Pro",
          },
        },
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      data?: { attributes?: { checkout_url?: string } };
      errors?: { detail?: string }[];
    } | null;
    const url = json?.data?.attributes?.checkout_url;
    if (!res.ok || !url)
      return { ok: false as const, error: json?.errors?.[0]?.detail ?? "Could not start the payment. Please try again." };

    return { ok: true as const, checkout_url: url };
  });
