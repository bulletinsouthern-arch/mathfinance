import { getDatabase } from "@netlify/database";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CheckoutRecord = {
  id: string;
  user_id: string;
  course_id: string;
  provider_id: string;
  amount_centavos: number;
  plan: string;
  paid_at?: string | null;
};

// Only a paid payment retrieved directly from PayMongo can create an access grant.
export function checkoutPaymentMatches(checkout: any, receipt: CheckoutRecord): boolean {
  const a = checkout?.attributes;
  return (
    checkout?.id === receipt.provider_id &&
    a?.reference_number === `${receipt.user_id}:${receipt.course_id}:${receipt.id}` &&
    Array.isArray(a?.payments) &&
    a.payments.some(
      (p: any) =>
        p?.attributes?.status === "paid" &&
        p.attributes.currency === "PHP" &&
        Number(p.attributes.amount) === Number(receipt.amount_centavos),
    )
  );
}

export async function confirmCheckout(receipt: CheckoutRecord): Promise<boolean> {
  if (!receipt.paid_at) {
    const { data: pay, error } = await supabaseAdmin
      .from("payment_settings")
      .select("secret_key,enabled")
      .eq("provider", "paymongo")
      .maybeSingle();
    if (error || !pay?.enabled || !pay.secret_key || !receipt.provider_id) return false;
    const response = await fetch(
      `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(receipt.provider_id)}`,
      {
        headers: { Authorization: `Basic ${btoa(`${pay.secret_key}:`)}` },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok)
      throw new Error("Payment confirmation is temporarily unavailable. Please retry.");
    const json = await response.json();
    if (!checkoutPaymentMatches(json?.data, receipt)) return false;
  }
  const db = getDatabase();
  // One statement makes retries idempotent, even when webhook and return-page polling race.
  await db.sql`WITH paid AS (
    UPDATE course_checkouts SET paid_at=now() WHERE id=${receipt.id} AND paid_at IS NULL
    RETURNING user_id,course_id,plan
  ) INSERT INTO course_paid_access(user_id,course_id,expires_at)
    SELECT user_id,course_id,CASE WHEN plan='once' THEN NULL WHEN plan='yearly' THEN now()+interval '1 year' ELSE now()+interval '1 month' END FROM paid
    ON CONFLICT(user_id,course_id) DO UPDATE SET expires_at=CASE
      WHEN course_paid_access.expires_at IS NULL OR EXCLUDED.expires_at IS NULL THEN NULL
      ELSE GREATEST(course_paid_access.expires_at,now())+(EXCLUDED.expires_at-now()) END`;
  const grants =
    await db.sql`SELECT expires_at FROM course_paid_access WHERE user_id=${receipt.user_id} AND course_id=${receipt.course_id}`;
  const { error: enrollError } = await (supabaseAdmin as any).from("enrollments").upsert(
    {
      user_id: receipt.user_id,
      course_id: receipt.course_id,
      payment_verified: true,
      expires_at: grants[0]?.["expires_at"] ?? null,
    },
    { onConflict: "user_id,course_id" },
  );
  if (enrollError) throw new Error("Payment was verified. Enrollment is syncing; please retry.");
  return true;
}
