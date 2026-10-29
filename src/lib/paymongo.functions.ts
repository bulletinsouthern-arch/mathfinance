import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { PAYMONGO_METHODS } from "./payment-methods";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Creates a PayMongo checkout session for a paid course and returns the
// URL the student is sent to. Keys come from the admin payment settings.
export const createCourseCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        courseId: z.string().uuid(),
        plan: z.enum(["once", "monthly", "yearly"]).default("once"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: course } = await context.supabase
      .from("courses")
      .select("id, subject_id, code, title, price")
      .eq("id", data.courseId)
      .maybeSingle();
    if (!course) return { ok: false as const, error: "Course not found" };
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    const plans =
      await db.sql`SELECT monthly,yearly FROM course_payment_plans WHERE course_id=${course.id}`;
    const amount = data.plan === "once" ? Number(course.price) : Number(plans[0]?.[data.plan] ?? 0);
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false as const, error: "This payment option is unavailable." };
    const { readPaymentGateway } = await import("./payment-gateway.server");
    let pay;
    try {
      pay = await readPaymentGateway();
    } catch {
      return {
        ok: false as const,
        error:
          "Open Admin payment settings and save your PayMongo configuration to enable checkout.",
      };
    }
    if (!pay?.enabled || !pay.secret_key)
      return {
        ok: false as const,
        error: "Payment gateway access unavailable. PayMongo has not been set up yet.",
      };

    const { readCourseAccess } = await import("./course-access.server");
    const access = await readCourseAccess(context, data.courseId);
    if (access.allowed && access.paid)
      return { ok: false as const, error: "You already have active course access." };
    const origin = new URL(getRequest().url).origin;
    const courseUrl = `${origin}/courses/${course.subject_id}/${course.id}`;
    const amountCentavos = Math.round(amount * 100);
    if (amountCentavos < 1)
      return { ok: false as const, error: "The price must be at least PHP 0.01." };

    const configured =
      await db.sql`SELECT methods FROM course_payment_methods WHERE provider='paymongo'`;
    const methods = configured[0]?.["methods"] ?? [...PAYMONGO_METHODS];
    const receipts =
      await db.sql`INSERT INTO course_checkouts(user_id,course_id,plan,amount_centavos) VALUES(${context.userId},${course.id},${data.plan},${amountCentavos}) RETURNING id`;
    const receiptId = String(receipts[0]!["id"]);
    let res: Response;
    try {
      res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
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
              payment_method_types: methods,
              show_description: true,
              show_line_items: true,
              send_email_receipt: true,
              success_url: `${courseUrl}?paid=${receiptId}`,
              cancel_url: courseUrl,
              reference_number: `${context.userId}:${course.id}:${receiptId}`,
              description: "Course enrollment — Math & Finance Pro",
            },
          },
        }),
      });
    } catch {
      return {
        ok: false as const,
        error: "PayMongo did not respond. Please retry opening checkout.",
      };
    }
    const json = (await res.json().catch(() => null)) as {
      data?: { id?: string; attributes?: { checkout_url?: string } };
      errors?: { detail?: string }[];
    } | null;
    const url = json?.data?.attributes?.checkout_url;
    if (!res.ok || !url)
      return {
        ok: false as const,
        error:
          res.status === 401
            ? "PayMongo rejected the secret key. Ask the administrator to update it in payment settings."
            : res.status === 403
              ? "PayMongo has not enabled checkout for this merchant. Ask the administrator to check account activation and payment methods."
              : "PayMongo could not open checkout. Ask the administrator to check the selected payment methods and course price, then retry.",
      };

    if (!json?.data?.id)
      return {
        ok: false as const,
        error: "Payment gateway access unavailable. Please try again later.",
      };
    await db.sql`UPDATE course_checkouts SET provider_id=${json.data.id} WHERE id=${receiptId}`;
    return { ok: true as const, checkout_url: url };
  });

// Return availability only; payment credentials stay on the server.
export const paymentGatewayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { readPaymentGateway } = await import("./payment-gateway.server");
    const data = await readPaymentGateway();
    return {
      available: !!data?.enabled && !!data.secret_key,
      webhookReady: !!data?.webhook_secret,
    };
  });

// The caller can only reconcile and read receipts belonging to their own account.
export const courseReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ courseId: z.string().uuid(), checkoutId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    if (data.checkoutId) {
      const rows =
        await db.sql`SELECT * FROM course_checkouts WHERE id=${data.checkoutId} AND user_id=${context.userId} AND course_id=${data.courseId}`;
      if (rows[0]) {
        const { confirmCheckout } = await import("./payment-verification.server");
        // Reconcile paid rows too: a previous enrollment sync may have failed.
        await confirmCheckout(
          rows[0] as unknown as import("./payment-verification.server").CheckoutRecord,
        );
      }
    }
    const rows =
      await db.sql`SELECT c.id,c.plan,c.amount_centavos,c.provider_id,c.paid_at,a.expires_at
      FROM course_checkouts c LEFT JOIN course_paid_access a ON a.user_id=c.user_id AND a.course_id=c.course_id
      WHERE c.user_id=${context.userId} AND c.course_id=${data.courseId} AND c.paid_at IS NOT NULL ORDER BY c.paid_at DESC LIMIT 50`;
    return rows.map((r) => ({
      id: String(r["id"]),
      plan: String(r["plan"]),
      amountCentavos: Number(r["amount_centavos"]),
      reference: String(r["provider_id"]),
      paidAt: String(r["paid_at"]),
      expiresAt: r["expires_at"] ? String(r["expires_at"]) : null,
    }));
  });

export const paymentMethods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        methods: z.array(z.enum(PAYMONGO_METHODS)).min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("Administrator access required");
    const { getDatabase } = await import("@netlify/database");
    const db = getDatabase();
    const { syncPaymentGateway } = await import("./payment-gateway.server");
    await syncPaymentGateway(context.supabase);
    if (data.methods)
      await db.sql`INSERT INTO course_payment_methods(provider,methods) VALUES('paymongo',${JSON.stringify(data.methods)}::jsonb) ON CONFLICT(provider) DO UPDATE SET methods=EXCLUDED.methods`;
    const rows = await db.sql`SELECT methods FROM course_payment_methods WHERE provider='paymongo'`;
    return (rows[0]?.["methods"] ?? [...PAYMONGO_METHODS]) as string[];
  });
