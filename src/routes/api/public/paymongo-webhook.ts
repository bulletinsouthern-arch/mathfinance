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
        const { readPaymentGateway } = await import("@/lib/payment-gateway.server");
        const pay = await readPaymentGateway();
        if (!pay?.enabled || !pay.webhook_secret)
          return Response.json({ error: "Webhooks not configured" }, { status: 400 });

        // Paymongo-Signature: t=<timestamp>,te=<test sig>,li=<live sig>
        const header = request.headers.get("paymongo-signature") ?? "";
        const parts = Object.fromEntries(
          header.split(",").map((p) => p.split("=") as [string, string]),
        );
        const t = parts["t"];
        const expected = parts["li"] || parts["te"];
        if (
          !t ||
          !expected ||
          !Number.isFinite(Number(t)) ||
          Math.abs(Date.now() / 1000 - Number(t)) > 300
        )
          return Response.json({ error: "Missing signature" }, { status: 401 });

        const computed = await hmacSha256Hex(pay.webhook_secret, `${t}.${rawBody}`);
        if (!timingSafeEqual(computed, expected))
          return Response.json({ error: "Invalid signature" }, { status: 401 });

        let event: {
          data?: {
            attributes?: { type?: string; data?: { attributes?: { reference_number?: string } } };
          };
        };
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
        if (
          !userId ||
          !courseId ||
          !uuid.test(userId) ||
          !uuid.test(courseId) ||
          !receiptId ||
          !uuid.test(receiptId)
        )
          return Response.json({ error: "Bad reference" }, { status: 400 });

        const { getDatabase } = await import("@netlify/database");
        const db = getDatabase();
        const providerId = (event.data.attributes.data as { id?: string })?.id;
        if (!providerId) return Response.json({ error: "Missing checkout" }, { status: 400 });
        const receipts =
          await db.sql`SELECT id FROM course_checkouts WHERE id=${receiptId} AND user_id=${userId} AND course_id=${courseId} AND provider_id=${providerId}`;
        if (!receipts.length) return Response.json({ error: "Unknown checkout" }, { status: 400 });
        const rows =
          await db.sql`SELECT * FROM course_checkouts WHERE id=${receiptId} AND provider_id=${providerId}`;
        const { confirmCheckout } = await import("@/lib/payment-verification.server");
        try {
          if (
            !(await confirmCheckout(
              rows[0] as unknown as import("@/lib/payment-verification.server").CheckoutRecord,
            ))
          )
            return Response.json({ error: "Payment not verified" }, { status: 409 });
        } catch {
          return Response.json(
            { error: "Payment confirmation pending; retry delivery" },
            { status: 503 },
          );
        }

        return Response.json({ enrolled: true });
      },
    },
  },
});
