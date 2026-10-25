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
        const expected = parts["li"] ?? parts["te"];
        if (!t || !expected) return Response.json({ error: "Missing signature" }, { status: 401 });

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
        const [userId, courseId] = ref.split(":");
        const uuid = /^[0-9a-f-]{36}$/i;
        if (!userId || !courseId || !uuid.test(userId) || !uuid.test(courseId))
          return Response.json({ error: "Bad reference" }, { status: 400 });

        const { error } = await supabaseAdmin
          .from("enrollments")
          .upsert({ user_id: userId, course_id: courseId }, { onConflict: "user_id,course_id" });
        if (error) return Response.json({ error: "Enroll failed" }, { status: 500 });

        return Response.json({ enrolled: true });
      },
    },
  },
});
