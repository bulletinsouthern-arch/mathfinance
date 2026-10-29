import { getDatabase } from "@netlify/database";

export type GatewaySettings = {
  secret_key: string;
  webhook_secret?: string;
  enabled: boolean;
};

// Private runtime copy: customers never receive payment credentials.
export async function readPaymentGateway(): Promise<GatewaySettings | null> {
  const rows = await getDatabase()
    .sql`SELECT secret_key,webhook_secret,enabled FROM payment_gateway_settings WHERE provider='paymongo'`;
  if (rows[0]) return rows[0] as unknown as GatewaySettings;
  // Preserve existing installations until an admin opens payment settings.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("payment_settings")
      .select("secret_key,webhook_secret,enabled")
      .eq("provider", "paymongo")
      .maybeSingle();
    if (error) throw new Error("Unavailable");
    return data;
  } catch {
    throw new Error(
      "Open Admin payment settings and save your PayMongo configuration to enable checkout.",
    );
  }
}

// Caller must verify the administrator role before invoking this function.
export async function syncPaymentGateway(supabase: any) {
  const { data, error } = await supabase
    .from("payment_settings")
    .select("secret_key,webhook_secret,enabled")
    .eq("provider", "paymongo")
    .maybeSingle();
  if (error)
    throw new Error("Could not read payment settings. Retry saving your PayMongo configuration.");
  await getDatabase()
    .sql`INSERT INTO payment_gateway_settings(provider,secret_key,webhook_secret,enabled)
    VALUES('paymongo',${data?.secret_key?.trim() ?? ""},${data?.webhook_secret?.trim() ?? ""},${!!data?.enabled})
    ON CONFLICT(provider) DO UPDATE SET secret_key=EXCLUDED.secret_key,webhook_secret=EXCLUDED.webhook_secret,enabled=EXCLUDED.enabled`;
}
