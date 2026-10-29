import { createFileRoute } from "@tanstack/react-router";

// PayMongo webhook: verifies the signature, then enrolls the student whose
// checkout session was paid. reference_number carries "userId:courseId".

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/paymongo-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: pay } = await supabaseAdmin
          .from("payment_settings")
          .select("webhook_secret, enabled")
          .eq("provider", "paymongo")
          .maybeSingle();
        if (!pay?.enabled || !pay.webhook_secret)
          return Response.json({ error: "Webhooks not configured" }, { status: 400 });

        // Paymongo-Signature: t=<timestamp>,te=<test sig>,li=<live sig>
        const header = request.headers.get("paymongo-signature") ?? "";
        const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
        const t = parts["t"];
        const expected = parts["li"] || parts["te"];
        if (!t || !expected || !Number.isFinite(Number(t)) || Math.abs(Date.now()/1000-Number(t))>300) return Response.json({ error: "Missing signature" }, { status: 401 });

        const computed = await hmacSha256Hex(pay.webhook_secret, `${t}.${rawBody}`);
        if (!timingSafeEqual(computed, expected))
          return Response.json({ error: "Invalid signature" }, { status: 401 });

        let event: { data?: { attributes?: { type?: string; data?: { attributes?: { reference_number?: string } } } } };
        try {
          event = JSON.parse(rawBody);
        } catch {
          return Response.json({ error: "Bad payload" }, { status: 400 });
        }

        if (event.data?.attributes?.type !== "checkout_session.payment.paid")
          return Response.json({ received: true });

        const ref = event.data.attributes.data?.attributes?.reference_number ?? "";
        const [userId, courseId, receiptId] = ref.split(":");
        const uuid = /^[0-9a-f-]{36}$/i;
        if (!userId || !courseId || !uuid.test(userId) || !uuid.test(courseId) || !receiptId || !uuid.test(receiptId))
          return Response.json({ error: "Bad reference" }, { status: 400 });

        const {getDatabase}=await import('@netlify/database');
        const db=getDatabase();
        const providerId=(event.data.attributes.data as {id?:string})?.id;
        if(!providerId) return Response.json({error:"Missing checkout"},{status:400});
        const receipts=await db.sql`SELECT id FROM course_checkouts WHERE id=${receiptId} AND user_id=${userId} AND course_id=${courseId} AND provider_id=${providerId}`;
        if(!receipts.length) return Response.json({error:"Unknown checkout"},{status:400});
        await db.sql`WITH paid AS (
          UPDATE course_checkouts SET paid_at=now() WHERE id=${receiptId} AND paid_at IS NULL RETURNING user_id,course_id,plan
        ) INSERT INTO course_paid_access(user_id,course_id,expires_at)
          SELECT user_id,course_id,CASE WHEN plan='once' THEN NULL WHEN plan='yearly' THEN now()+interval '1 year' ELSE now()+interval '1 month' END FROM paid
          ON CONFLICT(user_id,course_id) DO UPDATE SET expires_at=CASE WHEN course_paid_access.expires_at IS NULL OR EXCLUDED.expires_at IS NULL THEN NULL ELSE GREATEST(course_paid_access.expires_at,now())+(EXCLUDED.expires_at-now()) END`;
        const grants=await db.sql`SELECT expires_at FROM course_paid_access WHERE user_id=${userId} AND course_id=${courseId}`;
        const { error } = await (supabaseAdmin as any)
          .from("enrollments")
          .upsert({ user_id: userId, course_id: courseId, payment_verified:true, expires_at:grants[0]?.['expires_at']??null }, { onConflict: "user_id,course_id" });
        if (error) return Response.json({ error: "Enroll failed" }, { status: 500 });

        return Response.json({ enrolled: true });
      },
    },
  },
});
