import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Creates a PayMongo checkout session for a paid course and returns the
// URL the student is sent to. Keys come from the admin payment settings.
export const createCourseCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ courseId: z.string().uuid(), plan: z.enum(["once","monthly","yearly"]).default("once") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("id, subject_id, code, title, price")
      .eq("id", data.courseId)
      .maybeSingle();
    if (!course) return { ok: false as const, error: "Course not found" };
    const {getDatabase}=await import('@netlify/database');
    const db=getDatabase();
    const plans=await db.sql`SELECT monthly,yearly FROM course_payment_plans WHERE course_id=${course.id}`;
    const amount=data.plan==='once'?Number(course.price):Number(plans[0]?.[data.plan]??0);
    if(!Number.isFinite(amount)||amount<=0) return {ok:false as const,error:"This payment option is unavailable."};
    const { data: pay } = await supabaseAdmin
      .from("payment_settings")
      .select("secret_key, enabled")
      .eq("provider", "paymongo")
      .maybeSingle();
    if (!pay?.enabled || !pay.secret_key)
      return { ok: false as const, error: "Payment gateway access unavailable. PayMongo has not been set up yet." };

    const {error:protectionError}=await (supabaseAdmin as any).from('enrollments').select('payment_verified,expires_at').limit(0);
    if(protectionError) return {ok:false as const,error:"Payment gateway access unavailable. Please try again later."};
    const origin = new URL(getRequest().url).origin;
    const courseUrl = `${origin}/courses/${course.subject_id}/${course.id}`;
    const amountCentavos = Math.round(amount * 100);

    const receipts=await db.sql`INSERT INTO course_checkouts(user_id,course_id,plan,amount_centavos) VALUES(${context.userId},${course.id},${data.plan},${amountCentavos}) RETURNING id`;
    const receiptId=String(receipts[0]!['id']);
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
                name: `${data.plan === "yearly" ? "Yearly access (paid in advance): " : data.plan === "monthly" ? "Monthly access: " : ""}${course.code ? `${course.code}: ` : ""}${course.title}`,
                amount: amountCentavos,
                currency: "PHP",
                quantity: 1,
              },
            ],
            payment_method_types: ["card", "gcash", "paymaya", "grab_pay"],
            success_url: `${courseUrl}?paid=1`,
            cancel_url: courseUrl,
            reference_number: `${context.userId}:${course.id}:${receiptId}`,
            description: "Course enrollment — Math & Finance Pro",
          },
        },
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      data?: { id?: string; attributes?: { checkout_url?: string } };
      errors?: { detail?: string }[];
    } | null;
    const url = json?.data?.attributes?.checkout_url;
    if (!res.ok || !url)
      return { ok: false as const, error: json?.errors?.[0]?.detail ?? "Could not start the payment. Please try again." };

    if(!json?.data?.id) return {ok:false as const,error:"Payment gateway access unavailable. Please try again later."};
    await db.sql`UPDATE course_checkouts SET provider_id=${json.data.id} WHERE id=${receiptId}`;
    return { ok: true as const, checkout_url: url };
  });

// Return availability only; payment credentials stay on the server.
export const paymentGatewayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("payment_settings")
      .select("secret_key, enabled").eq("provider", "paymongo").maybeSingle();
    if (error) throw new Error("Payment gateway status unavailable");
    return { available: !!data?.enabled && !!data.secret_key };
  });
